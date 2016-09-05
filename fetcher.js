var debug = require('debug')('Fetcher');
var config = require("./config");
var TDXApi = require("nqm-api-tdx");
var imapTableAPI = new TDXApi(config);
var mailTableAPI = new TDXApi(config);

var Imap = require('imap');
var inspect = require('util').inspect;


debug('Auth into TBX with token: '+config.byodimapboxes_token+' and password: '+config.byodimapboxes_Pass+' ...');


imapTableAPI.authenticate(config.byodimapboxes_token, config.byodimapboxes_Pass, function(imaperr, accessToken){
	
	if (imaperr) throw imaperr;
	
	if (imaperr==null) {
		debug('Access token:'+accessToken);
		
        imapTableAPI.query("datasets/"+config.byodimapboxes_ID+"/data", null, null, null, function(imapqerr, data) {

			if (imapqerr) throw imapqerr;

			else {
				data.data.forEach(function(imapel){
					var firstfetch =false;
					var nmsg = 0;
					var nnewmsg = 0;
					var imap = new Imap({
  						user: imapel.userid,
  						password: imapel.userpass,
 	 					host: imapel.imaphost,
  						port: imapel.imapport,
  						tls: imapel.imaptls,
						debug: function(d) {
            				debug(d)              
         				}
					});

					function openInbox(cb) {
  						imap.openBox(imapel.mailboxname, false, cb);
					}

					imap.once('ready', function() {
  						openInbox(function(mailopenerr, box) {
							
							if (mailopenerr) throw mailopenerr;
							
							debug('Total number of messages:'+box.messages.total);
							debug('Total number of new messages:'+box.messages.new);
							debug('Box flags:'+box.flags);
							debug('Box permFlags:'+box.permFlags);

							nmsg = box.messages.total;
							nnewmsg = box.messages.new;

							mailTableAPI.authenticate(imapel.mailtabletoken, imapel.mailtablepass, function(mailtableerr, mailtableaccessToken){

								if (mailtableerr) throw mailtableerr;

    							var f, endstr='1:0';
								var unseenlistid = [];

								if (imapel.total==0 && box.messages.total!=0)
									endstr = '1:*'
								else if (imapel.total!=0)
									endstr = '1:'+box.messages.new;

    							f = imap.seq.fetch(endstr, {
      								bodies: ['HEADER', 'TEXT'],
      								struct: true
    							});

    							f.on('message', function(msg, seqno) {
      								debug('Message #%d', seqno);
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
        								});
      								});

      								msg.once('attributes', function(attrs) {
										mailtabledata.uid = attrs.uid;
										mailtabledata.modseq = attrs.modseq;
										mailtabledata.flags = attrs.flags.join(',');
      								});

      								msg.once('end', function() {
										if (mailtabledata.flags.indexOf('\Seen')<0)
											unseenlistid.push(seqno.toString());

										//mailTableAPI.addDatasetData(imapel.mailtableid, mailtabledata, mailtableaccessToken, function(mailadddataerr, mailadddatabody){
											//if (mailadddataerr) throw mailadddataerr;

											//console.log(mailtabledata);	
        									debug(prefix + 'Finished');
										//});
      								});
    							});

    							f.once('error', function(err) {
      								debug('Fetch error: ' + err);
    							});

    							f.once('end', function() {
									debug('Unseen messages ids:'+unseenlistid);
                                    debug('Done fetching all messages!');
                                   	if (unseenlistid.length>0) { 
										imap.seq.setFlags(unseenlistid, '\Seen', function(setflagerr){
                                    		if (setflagerr) throw setflagerr;               
										});
									}

									firstfetch = true;
    							});
							});

  						});
					});

					imap.on('mail', function(numNewMsgs){
						var endstr, nmsgold = nmsg+1;
						if (firstfetch) {
							nmsg = nmsg + numNewMsgs	
							endstr = nmsgold+':'+nmsg;
							debug('New message:'+numNewMsgs);
							var f = imap.seq.fetch(endstr, {
								bodies: ['HEADER', 'TEXT'],
                                struct: true
                            });
						}
					});

					imap.once('error', function(err) {
  						debug(err);
					});

					imap.once('end', function() {
  						debug('Connection ended');
					});

					imap.connect();
				});
			}
        });
    }
});

