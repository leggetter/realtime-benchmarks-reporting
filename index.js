var http = require('http'),
    faye = require('faye'),
    express = require('express'),
    request = require('request'),
    bodyParser = require('body-parser'),
    cors = require('cors');
    
var app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cors());

var port = process.env.PORT || 5000;
var server = app.listen( port, function() {
  console.log( 'listening on port %s', port );
} );

var Pusher = require('pusher');
var pusher = new Pusher({
  appId: process.env['PUSHER_APP_ID'],
  key: process.env['PUSHER_APP_KEY'],
  secret: process.env['PUSHER_APP_SECRET']
});    

var AUTH_HEADER_NAME = 'X-RTAUTH'.toLowerCase();
var RT_AUTH_HEADER = process.env.RT_AUTH_HEADER;
if( !RT_AUTH_HEADER ) {
  throw new Error( 'RT_AUTH_HEADER environmental variable not found.' +
   'It is required in order for the server to authenticate incoming latency POSTs.' );
}

var SupportedChannelsExt = require( './SupportedChannelsExt' );

var bayeux = new faye.NodeAdapter({mount: '/realtime', timeout: 45});

var knownServices = {
  'pusher' : {},
  'pubnub' : {},
  'realtimeco' : {},
  'firebase' : {},
  'fanout' : {},
  'hydna' : {},
  'datamcfly' : {}
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

function publishResult( service, result, timestamp ) {
  if( !knownServices[ service ] ) {
    console.error( 'Not publishing result for unknown service "%s"', service );
    return;
  }

  console.log( 'Publishing result for service "%s"', service );

  var channel = '/services/' + service;
  var message = {
    data: result,
    service: service,
    timestamp: timestamp
  };
  bayeux.getClient().publish( channel, message );
}

// HTTP
app.get( '/', function(req, res) {
  res.end('Home page');
} );

app.get( '/stats', function(req, res) {
  res.json( subscriptionCount );
} );

app.post( '/latency', function(req, res) {
  var self = this;
  try {
    console.log( 'req', req );
    var authHeader = req.headers[ AUTH_HEADER_NAME ];
    if( authHeader !== RT_AUTH_HEADER ) {
      res.writeHead( 401 );
      res.end( 'Not authorized: ' + authHeader );
    }

    // console.log( 'POST: Body: "%s"', JSON.stringify( req.body, null, 2 ) );

    var latencyResults = req.body.latencyResults;
    var timestamp = req.body.timestamp || Date.now();
    for( var serviceName in latencyResults ) {
      publishResult( serviceName.toLowerCase(), latencyResults[ serviceName ], timestamp );
    }

    res.writeHead( 200 );
    res.end();
  }
  catch( e ) {
    console.error( e );
    res.writeHead( 500 );
    res.end( e.toString() );
  }

} );

app.get('/results', function(req, res) {
  request('http://phobos7.co.uk/leggetter/realtime_benchmarks/results.php', function(err, resp, body) {
    if(err) {
      console.error(err);
      res.writeHead(500);
      res.end();
    }
    else {
      res.json(JSON.parse(body));
    }
  });
});

app.post('/results', function(req, res) {
  var body = req.body;
    
  request({
    url: 'http://phobos7.co.uk/leggetter/realtime_benchmarks/results.php',
    method: 'POST',
    data: body
  }, function(err, resp, resultBody) {
    if(err) {
      res.writeHead(500);
    }
    else {
      res.json(resultBody);
    }
  });
});

app.post('/update-results', function(req, res) {
  var data = {
    id: req.body.id,
    data: req.body.data
  };
  request({
    url: 'http://phobos7.co.uk/leggetter/realtime_benchmarks/update_results.php',
    method: 'POST',
    data: data
  }, function(err, resp, resultBody) {
    if(err) {
      res.writeHead(500);
    }
    else {
      res.json(resultBody);
    }
  });
});

app.post('/pusher-auth', function(req, res) {
  var socketId = req.body.socket_id;
  var channelName = req.body.channel_name;

  var auth = pusher.authenticate(socketId, channelName);
  res.json(auth);
});
