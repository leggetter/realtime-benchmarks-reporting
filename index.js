var http = require('http'),
    faye = require('faye'),
    director = require('director');

var AUTH_HEADER_NAME = 'X-RTAUTH';
var RT_AUTH_HEADER = process.env.RT_AUTH_HEADER;
if( !RT_AUTH_HEADER ) {
  throw new Error( 'RT_AUTH_HEADER environmental variable not found.' +
   'It is required in order for the server to authenticate incoming latency POSTs.' );
}

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
  'hydna' : {},
  'goinstant': {}
};

var servicesChannelPrefix = '/services/';
var supportedChannels = {};
for( var service in knownServices ) {
  supportedChannels[ servicesChannelPrefix + service ] = true;
}
// allow wildcard
supportedChannels[ servicesChannelPrefix + '*' ] = true;

var supportedChannelsExt = new SupportedChannelsExt( supportedChannels );
bayeux.addExtension( supportedChannelsExt );

// Handle non-Bayeux requests
bayeux.attach(server);

var subscriptionCount = {};

function incrementSubscribe( serviceName ) {
  if( !subscriptionCount[ serviceName ] ) {
    subscriptionCount[ serviceName ] = 0;
  }
  ++subscriptionCount[ serviceName ];

  console.log( 'Subscribers for "%s" increased to %s', serviceName, subscriptionCount[ serviceName ] );
}

function decrementSubscribe( serviceName ) {
  if( !subscriptionCount[ serviceName ] ) {
    console.error( 'unexpected unsubscribe. Channel "%s" not found in subscription list.', serviceName );
    return;
  }

  if( !subscriptionCount[ serviceName ] ) {
    subscriptionCount[ serviceName ] = 0;
  }
  --subscriptionCount[ serviceName ];

  console.log( 'Subscribers for "%s" decreased to %s', serviceName, subscriptionCount[ serviceName ] );
}

function subscribeAll() {
  for( var service in knownServices ) {
    incrementSubscribe( service );
  }
}

function unsubscribeAll() {
  for( var service in knownServices ) {
    decrementSubscribe( service );
  }
}

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

  if( channel === '/services/*' ) {
    subscribeAll();
  }
  else {
    var serviceName = getServiceName( channel );
    incrementSubscribe( serviceName );
  }
}

function unsubscribe( clientId, channel ) {
  console.log('[UNSUBSCRIBE] ' + clientId + ' -> ' + channel);

  if( channel === '/services/*' ) {
    unsubscribeAll();
  }
  else {
    var serviceName = getServiceName( channel );
    decrementSubscribe( serviceName );
  }
}

bayeux.bind( 'subscribe', subscribe );

bayeux.bind( 'unsubscribe', unsubscribe );

bayeux.bind('disconnect', function(clientId) {
  console.log('[DISCONNECT] ' + clientId);
} );

function publishResult( service, result ) {
  if( !knownServices[ service ] ) {
    console.error( 'Not publishing result for unknown service "%s"', service );
    return;
  }

  console.log( 'Publishing result for service "%s"', service );

  var channel = '/services/' + service;
  var message = {
    data: result,
    service: service
  };
  bayeux.getClient().publish( channel, message );
}

// HTTP
router.get( '/', function() {
  this.res.end('Home page');
} );

router.get( '/stats', function() {
  var jsonStats = JSON.stringify( subscriptionCount, null, 2 );
  this.res.end( jsonStats );
} );

router.post( '/latency', function() {
  var self = this;
  try {
    var authHeader = this.req.headers[ AUTH_HEADER_NAME ];
    if( authHeader !== RT_AUTH_HEADER ) {
      self.res.writeHead( 401 );
      self.res.end( 'Not authorized: ' + authHeader );
    }

    console.log( 'POST: Body: "%s"', JSON.stringify( this.req.body, null, 2 ) );

    var latencyResults = this.req.body.latencyResults;
    for( var serviceName in latencyResults ) {
      publishResult( serviceName.toLowerCase(), latencyResults[ serviceName ] );
    }

    self.res.writeHead( 200 );
    self.res.end();
  }
  catch( e ) {
    console.error( e );
    self.res.writeHead( 500 );
    self.res.end( e.toString() );
  }

} );

// Start server
var port = process.env.PORT || 5000;
server.listen( port, function() {
  console.log( 'listening on port %s', port );
} );
