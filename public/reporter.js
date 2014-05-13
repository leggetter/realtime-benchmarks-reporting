ko.bindingHandlers.fromNow = {
    update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        var value = valueAccessor();
        var valueUnwrapped = ko.utils.unwrapObservable(value);
        jQuery(element).text( moment( new Date(valueUnwrapped) ).format( 'HH:mm:ss' ) );
    }
};

ko.bindingHandlers.flash = {
    init: function(element, valueAccessor) {
        jQuery(element).addClass( 'animated flash' );
    }
};

var Logger = {
  incoming: function(message, callback) {
    this.log('incoming', message);
    callback(message);
  },
  outgoing: function(message, callback) {
    this.log('outgoing', message);
    callback(message);
  },
  log: function() {
    if( window.console ) {
      console.log( arguments )
    }
  }
};

function average( arr ) {
  var i = arr.length,
  sum = 0;
  while (i--) {
    sum = sum + arr[i];
  }
  return ( sum / arr.length ).toFixed( 2 );
}

var MAX_LATENCY_RESULTS = 7;

var LatencyViewModel = function() {

  this.services = [
    'firebase',
    'goinstant',
    'hydna',
    'pubnub',
    'pusher',
    'realtimeco'
  ];

  var latencyResults = [];
  this.services.forEach( function( service ) {
    latencyResults.push(
      { name: service, latency: ko.observableArray() }
    );
  } );

  // console.log( latencyResults );

  this.latencyResults = ko.observableArray( latencyResults );
  Logger.log( 'latencyResults', this.latencyResults.forEach );

  this.latencyTimestamps = ko.observableArray();
};
LatencyViewModel.prototype.updateLatency = function( message ) {
  Logger.log( arguments );

  var service = message.service;
  var data = message.data|| [];
  var timestamp = message.timestamp;

  var currentLatest = this.latencyTimestamps()[0];
  if( currentLatest !== timestamp ) {
    this.latencyTimestamps.unshift( timestamp );
    if( this.latencyTimestamps().length > MAX_LATENCY_RESULTS ) {
      this.latencyTimestamps.pop();
    }
    this.latencyTimestamps.valueHasMutated();
  }

  ko.utils.arrayForEach( this.latencyResults(), function( result, index ) {
    if( result.name === service ) {
      result.latency.unshift( average( data ) );
      Logger.log( 'latency count:', result.latency().length )
      if( result.latency().length > MAX_LATENCY_RESULTS ) {
        result.latency.pop();
      }
      Logger.log( result.latency );
      // TODO: restrict number of latency results
    }
  }, this );
};

var latencyViewModel = new LatencyViewModel();
ko.applyBindings( latencyViewModel );

function latencyResultReceived( message ) {
  latencyViewModel.updateLatency( message );
}

function cachedResults( data ) {
  var i = data.length,
      result;
  while( i > 0 ) {
    --i;
    result = data[ i ];
    publishCacheLatency( result );
  }
  addLiveData();
}

function publishCacheLatency( result ) {
  var data,
      message;
  for( var service in result.latencyResults ) {
    data = result.latencyResults[ service ];
    message = {
      service: service.toLowerCase(),
      data: data,
      timestamp: result.timestamp
    };
    latencyViewModel.updateLatency( message );
  }
}

function addLiveData() {
  var client = new Faye.Client('http://realtime-latency-stats.herokuapp.com/realtime');
  client.addExtension(Logger);

  var subscription = client.subscribe('/services/*', latencyResultReceived );
}

jQuery.getJSON( 'http://www.leggetter.co.uk/realtime_benchmarks/results.php', cachedResults );
