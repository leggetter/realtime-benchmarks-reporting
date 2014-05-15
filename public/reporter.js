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
      console.log( arguments );
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

// Knockout View Model for latency results
var LatencyViewModel = function() {

  this.services = [
    { serviceId: 'fanout', displayName: 'Fanout', url: 'http://fanout.io' },
    { serviceId: 'firebase', displayName: 'Firebase', url: 'http://firebase.com' },
    { serviceId: 'goinstant', displayName: 'GoInstant', url: 'http://goinstant.com' },
    { serviceId: 'hydna', displayName: 'Hydan', url: 'http://hydna.com' },
    { serviceId: 'pubnub', displayName: 'PubNub', url: 'http://pubnub.com' },
    { serviceId: 'pusher', displayName: 'Pusher', url: 'http://pusher.com' },
    { serviceId: 'realtimeco', displayName: 'Realtime.co', url: 'http://realtime.co' }
  ];

  var latencyResults = [];
  this.services.forEach( function( service ) {
    latencyResults.push( {
      name: service.serviceId,
      info: service,
      latency: ko.observableArray()
    } );
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

  $.getJSON( 'http://www.leggetter.co.uk/realtime_benchmarks/results.php', function() {
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
  var client = new Faye.Client('http://realtime-latency-stats.herokuapp.com/realtime');
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
