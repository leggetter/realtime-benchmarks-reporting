var optionDefaults = {
};

function SupportedChannelsExt( channels, options ) {
  this.channels = channels;
  this.options = options || {};

  for( var opt in optionDefaults ) {
    if( this.options[ opt ] === undefined ) {
      this.options[ opt ] = optionDefaults[ opt ];
    }
  }
}

SupportedChannelsExt.prototype.incoming = function( message, callback ) {
  console.log( 'Verifying subscription: "%s"', JSON.stringify( message, null, 2 ) );
  if ( channel !== '/meta/subscribe' ) {
    return callback(message);
  }

  var channel = message.subscription;
  if( !this.channels[ channel ] ) {
    // unknown channel
    message.error = '"' + channel + '" is an unsupported channel.';
    console.error( message.error );
  }

  return callback( message );

};

module.exports = SupportedChannelsExt;
