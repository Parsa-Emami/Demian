# V3 validation

Completed in the delivery environment:

- JavaScript syntax check for every file under `resources/js`
- Local ES module import path validation
- JSON validation for `tiam-atlas.json`
- PHP syntax check for app, routes, database, config and bootstrap files

The environment npm registry did not finish dependency download, so run the normal project commands locally:

```bash
npm install
npm run build
php artisan serve
```
