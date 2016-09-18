var BENCHMARK_SERVER = 'https://realtime-latency-stats.herokuapp.com';
// var BENCHMARK_SERVER = 'http://localhost:5000';

// Knockout bindings for the latency stats table
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

// Logger for the Faye client
var Logger = {
  logToConsole: false,

  incoming: function(message, callback) {
    this.log('incoming', message);
    callback(message);
  },
  outgoing: function(message, callback) {
    this.log('outgoing', message);
    callback(message);
  },
  log: function() {
    if( this.logToConsole && window.console ) {
      console.log( arguments );
    }
  }
};

function average( arr ) {
  var i = arr.length,
  sum = 0;
  while (i--) {
    sum = sum + parseInt( arr[i], 10 );
  }
  return ( sum / arr.length ).toFixed( 2 );
}

var MAX_LATENCY_RESULTS = 6;

function ServiceViewModel( service ) {
  this.name = service.serviceId;
  this.info = service;
  this.latency = ko.observableArray(),
  this.avg = ko.computed( this._calcAvg, this );
}

ServiceViewModel.prototype._calcAvg = function() {
  var values = this.latency();
  var displayAvg = '-';
  var avg = average( values );
  if( !isNaN( avg ) ) {
    displayAvg = avg;
  }
  return displayAvg;
};

// Knockout View Model for latency results
var LatencyViewModel = function() {

  this.services = [
    { serviceId: 'fanout', displayName: 'Fanout', url: 'http://fanout.io' },
    { serviceId: 'firebase', displayName: 'Firebase', url: 'http://firebase.com' },
    // { serviceId: 'hydna', displayName: 'Hydna', url: 'http://hydna.com' },
    { serviceId: 'pubnub', displayName: 'PubNub', url: 'http://pubnub.com' },
    { serviceId: 'pusher', displayName: 'Pusher', url: 'http://pusher.com' },
    { serviceId: 'realtimeco', displayName: 'Realtime.co', url: 'http://realtime.co' },
    { serviceId: 'datamcfly', displayName: 'DataMcFly', url: 'http://datamcfly.com' }
  ];

  var latencyResults = [];
  this.services.forEach( function( service ) {
    latencyResults.push( new ServiceViewModel( service ) );
  } );

  this.latencyResults = ko.observableArray( latencyResults );

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
      Logger.log( 'latency count:', result.latency().length );
      if( result.latency().length > MAX_LATENCY_RESULTS ) {
        result.latency.pop();
      }
    }
  }, this );
};

// Domain model for the latency report
function LatencyReport( viewModel, $ ) {
  var self = this;
  self._viewModel = viewModel;

  $.getJSON( BENCHMARK_SERVER + '/results', function() {
    self.cachedResults.apply( self, arguments );
  } );
}

LatencyReport.prototype.latencyResultReceived = function( message ) {
  this._viewModel.updateLatency( message );
};

LatencyReport.prototype.cachedResults = function( data ) {
  var i = data.length,
      result;
  while( i > 0 ) {
    --i;
    result = data[ i ];
    this.publishCacheLatency( result );
  }
  this.addLiveData();
};

LatencyReport.prototype.publishCacheLatency = function( result ) {
  var data,
      message;
  for( var service in result.latencyResults ) {
    data = result.latencyResults[ service ];
    message = {
      service: service.toLowerCase(),
      data: data,
      timestamp: result.timestamp
    };
    this._viewModel.updateLatency( message );
  }
};

LatencyReport.prototype.addLiveData = function() {
  var client = new Faye.Client(BENCHMARK_SERVER + '/realtime');
  client.addExtension(Logger);

  var self = this;
  var subscription = client.subscribe('/services/*', function() {
    self.latencyResultReceived.apply( self, arguments );
  } );
};

// Create View Model and bind
var latencyViewModel = new LatencyViewModel();
ko.applyBindings( latencyViewModel );

new LatencyReport( latencyViewModel, jQuery );
