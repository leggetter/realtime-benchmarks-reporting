var http = require('http'),
    faye = require('faye'),
    director = require('director');

var SupportedChannelsExt = require( './SupportedChannelsExt' );

var bayeux = new faye.NodeAdapter({mount: '/realtime', timeout: 45});
var router = new director.http.Router();

var server = http.createServer(function (req, res) {
  req.chunks = [];
  req.on( 'data', function ( chunk ) {
    req.chunks.push( chunk.toString() );
  } );

  router.dispatch(req, res, function (err) {
    if (err) {
      res.writeHead(500);
      var errorJson = JSON.stringify( err, null, 2 );
      res.end( errorJson );
    }
  });

});

var knownServices = {
  'pusher' : {},
  'pubnub' : {},
  'realtimeco' : {},
  'firebase' : {},
  'hydna' : {}
};

var servicesChannelPrefix = '/services/';
var supportedChannnels = {};
for( var service in knownServices ) {
  supportedChannnels[ servicesChannelPrefix + service ];
}

var supportedChannelsExt = new SupportedChannelsExt( supportedChannnels );

// Handle non-Bayeux requests
bayeux.attach(server);

var subscriptionCount = {};

function getServiceName( channel ) {
  // "service" is a META channel in Faye and can't be used
  var match = /\/services\/(.*)/.exec( channel );
  var serviceName = ( match? match[ 1 ] : null );
  var foundService = knownServices[ serviceName ];
  if( foundService === undefined ) {
    var unknownServiceMsg = 'Service "' + serviceName + '" is an unknown service.' +
                            ' Found: "' + foundService + '"';
    console.error( unknownServiceMsg );
    throw new Error( unknownServiceMsg );
  }

  return serviceName;
}

function subscribe( clientId, channel ) {
  console.log('[SUBSCRIBE] ' + clientId + ' -> ' + channel );

  var serviceName = getServiceName( channel );

  if( !subscriptionCount[ serviceName ] ) {
    subscriptionCount[ serviceName ] = 0;
  }
  ++subscriptionCount[ serviceName ];
}

function unsubscribe( clientId, channel ) {
  console.log('[UNSUBSCRIBE] ' + clientId + ' -> ' + channel);

  var serviceName = getServiceName( channel );

  if( !subscriptionCount[ serviceName ] ) {
    console.error( 'unexpected unsubscribe. Channel "%s" not found in subscription list.', channel );
    return;
  }
  --subscriptionCount[ serviceName ];
}

bayeux.bind( 'subscribe', subscribe );

bayeux.bind( 'unsubscribe', unsubscribe );

bayeux.bind('disconnect', function(clientId) {
  console.log('[DISCONNECT] ' + clientId);
} );

function publishResult( service, result ) {
  if( !knownServices[ service ] ) {
    console.error( 'Attempt to publish result for unknown service "%s"', service );
    return;
  }

  bayeux.getClient().publish('/services/' + service, result );
}

// HTTP
router.get( '/', function() {
  this.res.end('Home page');
} );

router.get( '/stats', function() {
  var jsonStats = JSON.stringify( subscriptionCount, null, 2 );
  this.res.end( jsonStats );
} );

router.post( '/latency', function( service ) {
  // TODO: Authentication - use a header

  var self = this;
  console.log( 'POST: "%s", Body: "%s"', service, JSON.stringify( this.req.body, null, 2 ) );

  var latencyResults = this.req.body.latencyResults;
  for( var serviceName in latencyResults ) {
    publishResult( serviceName.toLowerCase(), latencyResults[ serviceName ] );
  }

  self.res.writeHead( 200 );
  self.res.end();

} );

// Start server
var port = process.env.PORT || 5000;
server.listen( port, function() {
  console.log( 'listening on port %s', port );
} );
