#!/usr/bin/env python3
"""Convert the supplied Z-up, metre FBX into a self-contained runtime GLB.

Preserves mesh topology, vertex normals/UVs, embedded images and FBX materials.
Rhino NURBS and trimmed NURBS are tessellated in parameter space, including holes.
Only the offline importer needs tools/fbx/requirements.txt; the game needs no Python.
"""
from __future__ import annotations
import argparse, collections, gzip, hashlib, io, json, math, struct, zlib
from pathlib import Path
import numpy as np
from scipy.interpolate import BSpline
import mapbox_earcut
from shapely.geometry import Polygon, box
from shapely import make_valid
from PIL import Image

class Node:
    def __init__(self, name, props, children): self.name,self.props,self.children=name,props,children
    def child(self, name): return next((n for n in self.children if n.name==name),None)
    def get(self, name, default=None):
        n=self.child(name); return n.props[0] if n and n.props else default

class FBX:
    def __init__(self, path):
        source=Path(path)
        if source.name.endswith('.001'):
            paths=sorted(source.parent.glob(source.name[:-3]+'[0-9][0-9][0-9]'))
            self.data=b''.join(p.read_bytes() for p in paths)
        else:self.data=source.read_bytes()
        if self.data[:2]==b'\x1f\x8b':self.data=gzip.decompress(self.data)
        self.version=struct.unpack_from('<I',self.data,23)[0]
        if self.data[:23]!=b'Kaydara FBX Binary  \x00\x1a\x00' or self.version<7500: raise ValueError('Expected binary FBX 7500+ (64-bit nodes)')
        self.roots=[]; p=27
        while p<len(self.data)-25:
            n,p=self.node(p)
            if n is None: break
            self.roots.append(n)
        self.objects=next(n for n in self.roots if n.name=='Objects').children
        self.index={n.props[0]:n for n in self.objects}
        self.children=collections.defaultdict(list); self.parents=collections.defaultdict(list)
        for c in next(n for n in self.roots if n.name=='Connections').children:
            relation,child,parent,*rest=c.props
            self.children[parent].append((child,rest)); self.parents[child].append(parent)
    def prop(self,p):
        b=self.data; t=chr(b[p]); p+=1
        fmts={'Y':'h','C':'?','I':'i','F':'f','D':'d','L':'q'}
        if t in fmts:
            fmt='<'+fmts[t];return struct.unpack_from(fmt,b,p)[0],p+struct.calcsize(fmt)
        if t in 'SR':
            size=struct.unpack_from('<I',b,p)[0];p+=4;value=b[p:p+size]
            return (value.decode('utf-8',errors='replace') if t=='S' else value),p+size
        if t in 'fdlibc':
            count,encoding,size=struct.unpack_from('<III',b,p);p+=12
            raw=b[p:p+size];raw=zlib.decompress(raw) if encoding else raw
            return np.frombuffer(raw,dtype={'f':'<f4','d':'<f8','l':'<i8','i':'<i4','b':'u1','c':'u1'}[t]),p+size
        raise ValueError('Unsupported FBX property '+t)
    def node(self,p):
        b=self.data;end,count,length=struct.unpack_from('<QQQ',b,p);n=b[p+24];p+=25
        if not end:return None,p
        name=b[p:p+n].decode();p+=n;props=[];children=[]
        for _ in range(count):value,p=self.prop(p);props.append(value)
        while p<end-25:
            value,p=self.node(p)
            if value:children.append(value)
        return Node(name,props,children),end
    def links(self,id,kind):
        return [self.index[i] for i,_ in self.children[id] if i in self.index and self.index[i].name==kind]
    def group(self,id):
        for p in self.parents[id]:
            n=self.index.get(p)
            if n and n.name=='Model':
                if n.props[-1]=='Null':return n.props[1].split('\0')[0]
                return self.group(p)
        return 'ungrouped'

def properties(node):
    out={}
    for n in node.children:
        if n.name=='Properties70':
            for p in n.children:
                if p.name=='P':out[p.props[0]]=p.props[4:]
    return out

def curve(n):
    pts=n.get('Points').reshape(-1,4);knots=n.get('KnotVector');degree=int(n.get('Order'))-1
    missing=len(knots)-degree-1-len(pts)
    if missing>0 and n.get('Form') in ['Closed','Periodic']:pts=np.concatenate([pts,pts[:missing]])
    t=np.unique(np.concatenate([np.linspace(a,b,7) for a,b in zip(knots[degree:-degree-1],knots[degree+1:-degree]) if b>a]))
    basis=BSpline(knots,np.eye(len(pts)),degree,extrapolate=False)(t)
    result=basis@(pts[:,:3]*pts[:,3:]);weight=basis@pts[:,3]
    return result[:,:2]/weight[:,None]

def polygons(value):
    if value.is_empty:return []
    if value.geom_type=='Polygon':return [value]
    return [p for g in getattr(value,'geoms',[]) for p in polygons(g)]

def triangulate_polygon(poly):
    rings=[np.array(poly.exterior.coords)[:-1]]+[np.array(r.coords)[:-1] for r in poly.interiors]
    coords=np.concatenate(rings).astype('float64');ends=np.cumsum([len(r) for r in rings],dtype='uint32')
    inds=mapbox_earcut.triangulate_float64(coords,ends)
    return coords,inds.reshape(-1,3)

def nurbs_geometry(fbx,geometry):
    trim=geometry.props[-1]=='TrimNurbsSurface'
    surface=next((x for x in fbx.links(geometry.props[0],'Geometry') if x.props[-1]=='NurbsSurface'),None) if trim else geometry
    if surface is None:raise ValueError('Missing underlying NURBS surface')
    nu,nv=map(int,surface.child('Dimensions').props);orderU,orderV=map(int,surface.child('NurbsSurfaceOrder').props)
    ku,kv=surface.get('KnotVectorU'),surface.get('KnotVectorV');du,dv=orderU-1,orderV-1
    cp=surface.get('Points').reshape(nv,nu,4).transpose(1,0,2)
    extraU=len(ku)-du-1-nu;extraV=len(kv)-dv-1-nv
    forms=surface.child('Form').props
    if extraU>0 and forms[0] in ['Closed','Periodic']:cp=np.concatenate([cp,cp[:extraU]],axis=0);nu+=extraU
    if extraV>0 and forms[1] in ['Closed','Periodic']:cp=np.concatenate([cp,cp[:,:extraV]],axis=1);nv+=extraV
    def evaluate(uv):
        bu=BSpline(ku,np.eye(nu),du,extrapolate=False)(np.clip(uv[:,0],ku[du],ku[-du-1]))
        bv=BSpline(kv,np.eye(nv),dv,extrapolate=False)(np.clip(uv[:,1],kv[dv],kv[-dv-1]))
        weighted=cp[:,:,:3]*cp[:,:,3:]
        xyz=np.einsum('pi,pj,ijc->pc',bu,bv,weighted)
        w=np.einsum('pi,pj,ij->p',bu,bv,cp[:,:,3])
        return xyz/np.maximum(w[:,None],1e-15)
    u0,u1=ku[du],ku[-du-1];v0,v1=kv[dv],kv[-dv-1]
    domain=box(u0,v0,u1,v1)
    if trim:
        outer=[];holes=[]
        for boundary in fbx.links(geometry.props[0],'Geometry'):
            if boundary.props[-1]!='Boundary':continue
            parts=[curve(c) for c in fbx.links(boundary.props[0],'Geometry') if c.props[-1]=='NurbsCurve']
            if not parts:continue
            # FBX boundary curves are connected head to tail; accept reversed segments.
            chain=parts.pop(0).tolist()
            while parts:
                distances=[(np.linalg.norm(np.array(chain[-1])-p[0]),i,False) for i,p in enumerate(parts)]
                distances += [(np.linalg.norm(np.array(chain[-1])-p[-1]),i,True) for i,p in enumerate(parts)]
                _,i,reverse=min(distances);p=parts.pop(i)
                chain.extend((p[::-1] if reverse else p)[1:].tolist())
            ring=np.array(chain)
            if len(ring)<3:continue
            if properties(boundary).get('OuterBoundary',[1])[0]:outer.append(ring)
            else:holes.append(ring)
        if outer:
            domain=make_valid(Polygon(outer[0],holes)).intersection(domain)
    # Planar bilinear patches need only their exact trimmed boundaries. Curved
    # patches use their knot spans plus subdivisions (at most 24 per axis).
    def samples(k,d,count):
        spans=np.unique(k[d:len(k)-d]);steps=1 if count==2 and d==1 else min(6,max(2,24//max(1,len(spans)-1)))
        return np.unique(np.concatenate([np.linspace(a,b,steps+1) for a,b in zip(spans[:-1],spans[1:])]))
    us,vs=samples(ku,du,nu),samples(kv,dv,nv)
    uv=[];indices=[];offset=0
    for a,b in zip(us[:-1],us[1:]):
        for c,d in zip(vs[:-1],vs[1:]):
            patch=domain.intersection(box(a,c,b,d))
            for poly in polygons(patch):
                if poly.area<1e-14:continue
                coords,tri=triangulate_polygon(poly);uv.extend(coords);indices.extend(tri+offset);offset+=len(coords)
    if not indices:return None
    uv=np.array(uv);tri=np.array(indices);xyz=evaluate(uv)
    # Derivative normals respect the original rational surface and avoid seams.
    eu=max(1e-7,(u1-u0)*1e-5);ev=max(1e-7,(v1-v0)*1e-5)
    un=evaluate(uv+[eu,0])-evaluate(uv-[eu,0]);vn=evaluate(uv+[0,ev])-evaluate(uv-[0,ev])
    normal=np.cross(un,vn);normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-15)
    if geometry.get('FlipNormals',surface.get('FlipNormals',0)):
        normal*=-1;tri=tri[:,::-1]
    tex=(uv-[u0,v0])/[max(u1-u0,1e-10),max(v1-v0,1e-10)]
    return xyz,normal,tex,tri

def mesh_geometry(geo):
    xyz=geo.get('Vertices').reshape(-1,3);poly=geo.get('PolygonVertexIndex');faces=[];start=0
    for end in np.flatnonzero(poly<0):
        face=poly[start:end+1].copy();face[-1]=-face[-1]-1;start=end+1
        if len(face)==3:faces.append(face)
        elif len(face)>3:
            points=xyz[face];normal=np.cross(points[1]-points[0],points[2]-points[0]);axis=np.argmax(np.abs(normal))
            coords=np.delete(points,axis,axis=1).astype('float64');inds=mapbox_earcut.triangulate_float64(coords,np.array([len(face)],dtype='uint32'))
            faces.extend(face[inds.reshape(-1,3)])
    normalLayer=geo.child('LayerElementNormal');uvLayer=geo.child('LayerElementUV')
    for layer in [normalLayer,uvLayer]:
        if layer and (layer.get('MappingInformationType') not in ['ByVertice','ByVertex'] or layer.get('ReferenceInformationType')!='Direct'):
            raise ValueError('Unsupported vertex layer mapping')
    normals=normalLayer.get('Normals').reshape(-1,3) if normalLayer else np.zeros_like(xyz)
    uv=uvLayer.get('UV').reshape(-1,2) if uvLayer else np.zeros((len(xyz),2))
    return xyz,normals,uv,np.array(faces,dtype='uint32')

class GLB:
    def __init__(self):
        self.binary=bytearray();self.doc={'asset':{'version':'2.0','generator':'Demian FBX importer'},'buffers':[{}],
          'bufferViews':[],'accessors':[],'materials':[],'images':[],'textures':[],'samplers':[{'wrapS':10497,'wrapT':10497}],
          'nodes':[],'meshes':[],'scenes':[{'nodes':[]}],'scene':0}
    def view(self,raw,target=None):
        while len(self.binary)%4:self.binary.append(0)
        view={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(raw)}
        if target:view['target']=target
        self.binary.extend(raw);self.doc['bufferViews'].append(view);return len(self.doc['bufferViews'])-1
    def accessor(self,array,kind,component=5126):
        array=np.ascontiguousarray(array,dtype={5126:'<f4',5125:'<u4'}[component]);a={'bufferView':self.view(array.tobytes(),34963 if kind=='SCALAR' else 34962),
         'componentType':component,'count':len(array),'type':kind}
        if kind=='VEC3':a.update(min=array.min(0).tolist(),max=array.max(0).tolist())
        self.doc['accessors'].append(a);return len(self.doc['accessors'])-1
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.binary)
        j=json.dumps(self.doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
        b=bytes(self.binary);b+=b'\0'*((-len(b))%4)
        Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(b))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(b),b'BIN\0')+b)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('source');ap.add_argument('--out',default='public/assets/environments/demian-fbx');args=ap.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True);fbx=FBX(args.source);glb=GLB()
    globalSettings=properties(next(n for n in fbx.roots if n.name=='GlobalSettings'))
    if globalSettings.get('UpAxis')!=[2] or globalSettings.get('UnitScaleFactor')!=[100.0]:raise ValueError('This importer expects metre, Z-up FBX coordinates')
    materials={};textureMap={};imageMap={}
    for video in [n for n in fbx.objects if n.name=='Video']:
        raw=video.get('Content')
        if raw is None:continue
        image=Image.open(io.BytesIO(raw)).convert('RGB');image.thumbnail((1024,1024));buf=io.BytesIO();image.save(buf,format='JPEG',quality=88)
        glb.doc['images'].append({'bufferView':glb.view(buf.getvalue()),'mimeType':'image/jpeg','name':Path(str(video.get('Filename','')).replace('\\','/')).name})
        imageMap[video.props[0]]=len(glb.doc['images'])-1
    for texture in [n for n in fbx.objects if n.name=='Texture']:
        linked=fbx.links(texture.props[0],'Video')
        if linked and linked[0].props[0] in imageMap:
            glb.doc['textures'].append({'source':imageMap[linked[0].props[0]],'sampler':0});textureMap[texture.props[0]]=len(glb.doc['textures'])-1
    for material in [n for n in fbx.objects if n.name=='Material']:
        p=properties(material);color=np.array(p.get('DiffuseColor',p.get('Diffuse',[.65,.65,.65]))[:3]);color=np.where(color<=.04045,color/12.92,((color+.055)/1.055)**2.4)
        opacity=float(p.get('Opacity',[1])[0]);name=material.props[1].split('\0')[0]
        m={'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[*color.tolist(),opacity],'metallicFactor':0,'roughnessFactor':.82}}
        for tid,channel in fbx.children[material.props[0]]:
            if tid in textureMap and channel and channel[0] in ['DiffuseColor','Diffuse']:
                m['pbrMetallicRoughness']['baseColorTexture']={'index':textureMap[tid]}
        if opacity<.98:m['alphaMode']='BLEND'
        glb.doc['materials'].append(m);materials[material.props[0]]=len(glb.doc['materials'])-1
    glb.doc['materials'].append({'name':'unassigned','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.5,.5,.5,1],'metallicFactor':0,'roughnessFactor':1}})
    default=len(glb.doc['materials'])-1
    buckets=collections.defaultdict(list);stats=collections.Counter();meshRecords=[]
    # Reflection in X plus the Y/Z swap keeps winding right-handed. This faces
    # the entrance downward and places the reference counter on the right.
    scale=4.;centerX=-48.5125;frontY=43.
    def transform(v,normal=False):
        out=np.empty_like(v);out[:,0]=-v[:,0];out[:,1]=v[:,2];out[:,2]=v[:,1]
        if not normal:
            out[:,0]+=centerX;out[:,2]-=frontY;out*=scale
        return out
    for model in [n for n in fbx.objects if n.name=='Model' and n.props[-1] in ['Mesh','NurbsSurface','TrimNurbsSurface']]:
        p=properties(model)
        for key,identity in [('Lcl Translation',[0,0,0]),('Lcl Rotation',[0,0,0]),('Lcl Scaling',[1,1,1])]:
            if key in p and not np.allclose(p[key],identity):raise ValueError('Non-identity model transform: '+model.props[1])
        geometries=fbx.links(model.props[0],'Geometry');mats=fbx.links(model.props[0],'Material');mat=materials.get(mats[0].props[0],default) if mats else default
        if not geometries:continue
        geo=geometries[0];result=mesh_geometry(geo) if geo.props[-1]=='Mesh' else nurbs_geometry(fbx,geo)
        if result is None:raise ValueError('Empty surface: '+model.props[1])
        xyz,normals,uv,tri=result
        if len(tri)==0:stats['emptyMeshes']+=1;continue
        vertices=transform(xyz);normals=transform(normals,True)
        # Split large horizontal roof surfaces for an explicit full-model toggle.
        height=xyz[:,2];span=np.ptp(xyz,axis=0)
        overhead=height.min()>2.4 and span[0]*span[1]>.25
        group=fbx.group(model.props[0]);bucket=(mat,overhead)
        buckets[bucket].append((vertices,normals,uv,tri));stats[geo.props[-1]]+=1;stats['triangles']+=len(tri)
        meshRecords.append({'id':str(model.props[0]),'name':model.props[1].split('\0')[0],'group':group,'material':mat,
          'bounds':[vertices.min(0).round(5).tolist(),vertices.max(0).round(5).tolist()],'overhead':bool(overhead)})
        if stats['Mesh']%2500==0 and geo.props[-1]=='Mesh':print('Meshes:',stats['Mesh'],flush=True)
    allVertices=[];allTriangles=[];allOverhead=[];offset=0
    for (mat,overhead),parts in buckets.items():
        verts=[];normals=[];uvs=[];tris=[];voffset=0
        for v,n,u,t in parts:verts.append(v);normals.append(n);uvs.append(u);tris.append(t+voffset);voffset+=len(v)
        v=np.concatenate(verts);n=np.concatenate(normals);u=np.concatenate(uvs);u[:,1]=1-u[:,1];t=np.concatenate(tris)
        # Keep source vertex sharing; most source meshes already share vertices.
        primitive={'attributes':{'POSITION':glb.accessor(v,'VEC3'),'NORMAL':glb.accessor(n,'VEC3'),'TEXCOORD_0':glb.accessor(u,'VEC2')},'indices':glb.accessor(t.flatten(),'SCALAR',5125),'material':mat}
        glb.doc['meshes'].append({'primitives':[primitive]});mi=len(glb.doc['meshes'])-1
        glb.doc['nodes'].append({'name':('overhead-' if overhead else 'cafe-')+str(mat),'mesh':mi,'extras':{'overhead':bool(overhead)}})
        glb.doc['scenes'][0]['nodes'].append(len(glb.doc['nodes'])-1)
        allVertices.append(v);allTriangles.append(t+offset);allOverhead.extend([overhead]*len(t));offset+=len(v)
    glb.save(out/'cafe.glb')
    (out/'cafe.glb.gz').write_bytes(gzip.compress((out/'cafe.glb').read_bytes(),compresslevel=9,mtime=0))
    np.savez_compressed(out/'geometry.work.npz',vertices=np.concatenate(allVertices).astype('float32'),triangles=np.concatenate(allTriangles),overhead=np.array(allOverhead))
    report={'source':'دمیان .fbx','sha256':hashlib.sha256(fbx.data).hexdigest(),'fbxVersion':fbx.version,'units':'metres','upAxis':'Z',
      'transform':{'gameplayUnitsPerMetre':scale,'sourceCenterX':centerX,'sourceFrontY':frontY,'x':'-(sourceX - sourceCenterX) * scale','y':'sourceZ * scale','z':'(sourceY - sourceFrontY) * scale'},
      'counts':dict(stats),'embeddedImages':len(imageMap),'materials':len(materials),'drawCalls':len(buckets),'bytes':(out/'cafe.glb').stat().st_size,
      'models':meshRecords}
    (out/'import-report.work.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
    (out/'import-report.json').write_text(json.dumps({k:v for k,v in report.items() if k!='models'},ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='models'},indent=2))
if __name__=='__main__':main()
