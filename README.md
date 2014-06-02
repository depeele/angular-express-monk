angular-express-monk
====================

A minimal base server for an Angular web-app using server-side  Express and Monk/MongoDB.

Provide a minimal server for an Angular / Express-based application that uses MongoDB via Monk.

This server will make the MongoDB database indicated by `config.dbUrl` available in a [RESTFUL](http://en.wikipedia.org/wiki/Restful) [CRUD](http://en.wikipedia.org/wiki/Create,_read,_update_and_delete) mode via the `config.apiPath` ('/api') URL.

The Angular app is served from the directory indicated by `config.appPath`.

Example:
```
    var app = require('angular-express-monk')({
                port:   8080,
                dbUrl:  'mongodb://localhost/mydb',
                appPath:'./angularApp',
                apiPath:'/api'
              });
```
