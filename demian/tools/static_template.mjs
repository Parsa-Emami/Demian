export function renderStaticTemplate(template, { entry, arcadeApi = '', publicOrigin = '' }) {
    if (publicOrigin && (!/^https:\/\/[a-z0-9][a-z0-9.-]*$/i.test(publicOrigin)
        || publicOrigin.includes('..'))) {
        throw new Error('DEMIAN_PUBLIC_ORIGIN must be a bare HTTPS hostname.');
    }
    const literals = [];
    const html = template.replace(/\{\{--[\s\S]*?--\}\}/g, '')
        .replace(/@verbatim([\s\S]*?)@endverbatim/g, (_, literal) => {
            literals.push(literal);
            return `\u0000DEMIAN_LITERAL_${literals.length - 1}\u0000`;
        })
        .replace(/@vite\([\s\S]*?\)/, `${(entry.css ?? []).map(c => `<link rel="stylesheet" href="build/${c}">`).join('\n')}\n<script type="module" src="build/${entry.file}"></script>`)
        .replace('name="demian-static-release" content="false"',
            'name="demian-static-release" content="true"')
        .replace(/\{\{\s*csrf_token\(\)\s*\}\}/g, '')
        .replace(/\{\{\s*route\('characters.index'\)\s*\}\}/g, 'characters.json')
        .replace(/\{\{\s*url\('\/api\/v1\/events'\)\s*\}\}/g, 'api/v1/events')
        .replace(/\{\{\s*url\('\/api\/v1\/arcade'\)\s*\}\}/g, arcadeApi);
    if (/@[a-zA-Z_]|\{\{/.test(html)) throw new Error('Unsupported template directive in static export.');
    let result = html.replace(/\u0000DEMIAN_LITERAL_(\d+)\u0000/g, (_, index) => literals[Number(index)]);
    if (publicOrigin) {
        const home = publicOrigin + '/';
        result = result.replace('</head>',
            '    <link rel="canonical" href="' + home + '">\n' +
            '    <meta property="og:url" content="' + home + '">\n</head>')
            .replace('"@id": "./#demian"', '"@id": "' + home + '#demian"')
            .replace('"url": "./"', '"url": "' + home + '"');
    }
    return result;
}
