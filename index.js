/**
 *  Provide a minimal server for an Angular / Express-based application that
 *  uses MongoDB via Monk.
 *
 *  This server will make the MongoDB database indicated by `config.dbUrl`
 *  available in a RESTFUL CRUD mode via the '/api' URL.
 *
 *  The Angular app is served from the directory indicated by `config.appPath`.
 *
 *  Example:
 *      var app = require('angular-express-monk')({
 *                  port:   8080,
 *                  dbUrl:  'mongodb://localhost/mydb',
 *                  appPath:'./angularApp'
 *                });
 */
var Path    = require('path'),
    _       = require('lodash'),
    Express = require('express'),
    Monk    = require('monk');

/**
 *  Create a new express-based application server.
 *  @param  config              A configuration object {Object};
 *  @param  config.dbUrl        The full url to the MongoDB server, including
 *                              the target database {String}:
 *                                  mongodb://localhost:27017/db
 *  @param  [config.port=8000]  The port to listen on {Number};
 *  @param  [config.appPath=process.cwd() +'/app]
 *                              The directory containing the angular
 *                              application {String};
 *
 *  @return A new Express Application instance {Object};
 */
function CreateServer(config)
{
    var app;

    config = config || {};

    if (! _.isString(config.dbUrl)) {
        throw new Error("Missing config.dbUrl");
    }

    config.dbName    = Path.basename( config.dbUrl );
    config.dbBaseUrl = Path.dirname(  config.dbUrl );

    if (config.dbBaseUrl.slice(-1) !== '/') {
        config.dbBaseUrl += '/';
    }

    // Create the Express Application
    app = Express();

    // Configure and initialize
    app.configure( _initialize.bind(app, config) );

    return app;
};

/**
 *  Initialize the new app.
 *  @param  config      The configuration object passed to CreateServer()
 *                      {Object};
 *
 *  `this` is the new Express app.
 */
function _initialize(config)
{
    var self    = this,
        Db      = require('monk')(config.dbUrl);

    Object.defineProperties(self, {
        dbUrl:      { get:function(){ return config.dbUrl; } },
        dbName:     { get:function(){ return config.dbName; } },
        dbBaseUrl:  { get:function(){ return config.dbBaseUrl; } },
        port:       { value: (config.port || 8000) },
        appPath:    { value: (config.appPath ||
                                Path.join(process.cwd(), 'app')) },

        reName:     { value: new RegExp('^'+ config.dbName +'\.') },

        Db:         { get:function(){ return Db; } },
        db:         { get:function(){ return self.Db.driver; } }
    });

    self.collections = {};

    /* To avoid connect deprecation warnings for 'multipart' from
     *  self.use(Express.bodyParser());
     *
     *      https://github.com/senchalabs/connect/wiki/Connect-3.0
     */
    self.use( Express.urlencoded() );
    self.use( Express.json() );

    /********************************************************************
     * API routes
     *
     */
    self.get('/api', function(req, res) {
        self.db.collectionNames(function(e, names) {
            res.json(
                _.map(names, function(item) {
                    return item.name.replace(self.reName, '');
                })
            );
    
            //res.json(names);
        });
    });
    
    self.get('/api/:cname', function(req, res) {
        var name        = req.params.cname.replace(self.reName, ''),
            collection  = self.collections[name],
            query;
            
        if (collection == null) {
            collection = self.collections[name] = self.Db.get(name);
        }

        if (! _.isEmpty(req.query))
        {
            /* See if we have any keys/values that need to be interpreted:
             *      - value: "/.../"        : Regular Expression?
             *      - value: "null"         : null
             *      - value: "true"         : true
             *      - value: "false"        : false
             *      - value: "-123,456.78"  : -123456.78
             *      - value: "{...}"        : Object
             *      - value: "[...]"        : Array
             */
            query = _createQuery(req.query);
        }
    
        collection.find( query )
            .complete(function(err, docs) {
                res.json(docs);
            });
    });
    
    /********************************************************************
     * Collection CRUD
     *
     * Create
     */
    self.post('/api/:name', function(req, res) {
        var name        = req.params.name.replace(self.reName, ''),
            collection  = self.collections[name];
            
        if (collection == null) {
            collection = self.collections[name] = self.Db.get(name);
        }
    
        collection.insert( req.body )
            .error(function(err)    { res.json({error:err}); })
            .success(function(doc)  { res.json(doc); });
    });

    // Read
    self.get('/api/:name/:id', function(req, res) {
        var name        = req.params.name.replace(self.reName, ''),
            collection  = self.collections[name];
            
        if (collection == null) {
            collection = self.collections[name] = self.Db.get(name);
        }
    
        collection.findById( req.params.id )
            .error(function(err)    { res.json({error:err}); })
            .success(function(doc)  { res.json(doc); });
    });

    // Update
    self.put('/api/:name/:id', function(req, res) {
        var name        = req.params.name.replace(self.reName, ''),
            collection  = self.collections[name];
            
        if (collection == null) {
            collection = self.collections[name] = self.Db.get(name);
        }
    
        // First, find the matching doc so we can return it on success
        collection.update( req.params.id, {$set: req.body} )
            .error(function(err)    { res.json({error:err}); })
            .success(function(doc)  { res.json(doc); });
    });

    // Delete
    self.delete('/api/:name/:id', function(req, res) {
        var name        = req.params.name.replace(self.reName, ''),
            collection  = self.collections[name];
            
        if (collection == null) {
            collection = self.collections[name] = self.Db.get(name);
        }
    
        // First, find the matching doc so we can return it on success
        collection.findById( req.params.id )
            .error(function(err)    { res.json({error:err}); })
            .success(function(doc)  {
                collection.remove( req.params.id )
                    .error(function(err) { res.json({error:err}); })
                    .success(function()  { res.json(doc); });
            });
    });

    // Last of all, include a static router.
    self.use( Express.static( self.appPath ) );

    /********************************************************************
     * Start the server.
     *
     */
    self.server = self.listen(self.port, function() {
        console.log("Listening on port %d:", self.server.address().port);
        console.log("   /       => %s", self.appPath);
        console.log("   /api    => %s", self.dbUrl);
    });
}

/*****************************************************************************
 * Private helpers
 *
 */

// Regular expressions for _createQuery()
var _QueryRe    = {
    num:        /^(?:[+-])?(?:[0-9]{1,3}(?:,?[0-9]{3})*)(?:\.[0-9]+)?$/,
    re:         /^\/.*\/$/,
    reClean:    /(^\/|\/$)/g,
    obj:        /^\{.*\}$/,
    array:      /^\[.*\]$/,
    path:       /\s*\.\s*/
};

/**
 *  Given a request object, see if any of the keys/values
 */
function _createQuery(obj)
{
    var query   = {};

    if (_.isObject(obj))
    {
        _.each(obj, function(val, key) {
            /*
            var path    = key.split( _QueryRe.path );
            if (path.length > 1)
            {
                // Looks like a object-based path
                var curObj  = query,
                    lastKey = path.pop(),
                    curKey;
                _.each(path, function(curKey) {
                    if (! _.isObject(curObj[curKey])) {
                        curObj[curKey] = {};
                    }

                    curObj = curObj[curKey];
                });

                curObj[ lastKey ] = _createQuery(val);
                return;
            }
            // */

            query[ key ] = _createQuery(val);
        });
    }
    else if (_.isString(obj))
    {
        switch(obj)
        {
        // null
        case 'null':
            obj = null;
            break;

        // undefined
        case 'undefined':
            obj = undefined
            break;

        // Boolean
        case 'true':
            obj = true;
            break;

        case 'false':
            obj = false;
            break;

        default:
            // Number
            if (obj.match( _QueryRe.num )) {
                obj = parseFloat( obj.replace(/[^\-0-9\.]/g, '') );
            }
            // RegExp
            else if (obj.match( _QueryRe.re )) {
              try {
                /* Check to see if this value is a regular expression.
                 *
                 * First, remove the beginning and ending '/' and use
                 * that to try and create a new regular expression.
                 */
                obj = new RegExp( obj.replace( _QueryRe.reClean, '') );

                // YES -- it was a regular expression.
                //console.log("query[ %s ]: RegExp: %s", key, obj);

              } catch(e) {
                // NOT a regular expression
              }
            }
            // JSON
            else if (obj.match( _QueryRe.obj ) ||
                     obj.match( _QueryRe.array )) {
              try {
                // JSON object?
                obj = JSON.parse(obj);

                // YES -- it was JSON
                //console.log("query[ %s ]: JSON: %j", key, obj);

              } catch(e) {
                // NOT JSON
              }
            }
        }

        return obj;
    }


    return query;
}

/*****************************************************************************
 * Publically exported API
 *
 */
module.exports = CreateServer;
