var debug = require('debug')('Fetcher');
var config = require("./config");
var TDXApi = require("nqm-api-tdx");
var imapTableAPI = new TDXApi(config);
var mailTableAPI = new TDXApi(config);

var Imap = require('imap');
var inspect = require('util').inspect;


debug('Trying to authenticate into TBX with token: '+config.byodimapboxes_token+' and password: '+config.byodimapboxes_Pass+' ...');


imapTableAPI.authenticate(config.byodimapboxes_token, config.byodimapboxes_Pass, function(imaperr, accessToken){
	
	if (imaperr) throw imaperr;
	
	if (imaperr==null) {
		debug('Access token:'+accessToken);
		
        imapTableAPI.query("datasets/"+config.byodimapboxes_ID+"/data", null, null, null, function(imapqerr, data) {

			if (imapqerr) throw imapqerr;

			else {
				data.data.forEach(function(imapel){
					var imap = new Imap({
  						user: imapel.userid,
  						password: imapel.userpass,
 	 					host: imapel.imaphost,
  						port: imapel.imapport,
  						tls: imapel.imaptls
					});

					function openInbox(cb) {
  						imap.openBox(imapel.mailboxname, true, cb);
					}

					imap.once('ready', function() {
  						openInbox(function(mailopenerr, box) {
							
							if (mailopenerr) throw mailopenerr;
							
							mailTableAPI.authenticate(imapel.mailtabletoken, imapel.mailtablepass, function(mailtableerr, mailtableaccessToken){

								if (mailtableerr) throw mailtableerr;

    							var f, endstr='1:0';

								if (imapel.total==0 && box.messages.total!=0)
									endstr = '1:*'
								else if (imapel.total!=0)
									endstr = '1:'+box.messages.new;

    							f = imap.seq.fetch(endstr, {
      								bodies: ['HEADER', 'TEXT'],
      								struct: true
    							});

    							f.on('message', function(msg, seqno) {
      								console.log('Message #%d', seqno);
      								var prefix = '(#' + seqno + ') ';
									var mailtabledata = {uid:0, modseq:'', to:'', from:'', subject:'', date:'', text:'', textcount:0, flags:''};

									msg.on('body', function(stream, info) {
        								var buffer = '';
										var count = 0;

        								stream.on('data', function(chunk) {
          									count += chunk.length;
											buffer += chunk.toString('utf8');
        								});

        								stream.once('end', function() {
											if (info.which === 'HEADER') {
												mailtabledata.date = Imap.parseHeader(buffer).date.join(',');

												mailtabledata.to = Imap.parseHeader(buffer).to.join(',');

												mailtabledata.from = Imap.parseHeader(buffer).from.join(',');

												mailtabledata.subject = Imap.parseHeader(buffer).subject.join(',');
											} else if (info.which === 'TEXT') {
												mailtabledata.text = buffer;
												mailtabledata.textcount = count;
											}

        									//console.log(prefix + 'Parsed header: %s', inspect(Imap.parseHeader(buffer)));
        								});
      								});

      								msg.once('attributes', function(attrs) {
										mailtabledata.uid = attrs.uid;
										mailtabledata.modseq = attrs.modseq;
										mailtabledata.flags = attrs.flags.join(',');
										console.log(prefix + 'Attributes: %s', inspect(attrs, false, 8));
      								});

      								msg.once('end', function() {
										//mailTableAPI.addDatasetData(imapel.mailtableid, mailtabledata, mailtableaccessToken, function(mailadddataerr, mailadddatabody){
											//if (mailadddataerr) throw mailadddataerr;

											//console.log(mailtabledata);	
        									console.log(prefix + 'Finished');
										//});
      								});
    							});

    							f.once('error', function(err) {
      								console.log('Fetch error: ' + err);
    							});

    							f.once('end', function() {
      								console.log('Done fetching all messages!');
      								imap.end();
    							});
							});
  						});
					});

					imap.once('error', function(err) {
  						console.log(err);
					});

					imap.once('end', function() {
  						console.log('Connection ended');
					});

					imap.connect();
				});
			}
        });
    }
});

