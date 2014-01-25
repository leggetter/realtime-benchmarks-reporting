var optionDefaults = {
};

function SupportedChannelsExt( channels, options ) {
  this.channels = channels;
  this.options = options || {};

  for( var o in optionDefaults ) {
    if( this.options[ o ] === undefined ) {
      this.options[ o ] = optionDefaults[ 0 ];
    }
  }
}

SupportedChannelsExt.prototype.incoming = function( message, callback ) {
  var channel = message.channel;
  if ( channel !== '/meta/subscribe' ) {
    return callback(message);
  }

  if( !this.channels[ channel ] ) {
    // unknown channel
    message.error = '"' + channel + '" is an unsupported channel.';
  }

  callback( message );

};

module.exports = SupportedChannelsExt;