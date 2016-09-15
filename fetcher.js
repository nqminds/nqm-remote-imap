var debug = require('debug')('fetcher');
var config = require("./config");
var TDXApi = require("nqm-api-tdx");
var imapTableAPI = new TDXApi(config);

var Imap = require('imap');
var inspect = require('util').inspect;
var idTable = [];
var mailTableDict = {};

debug('Auth into TBX with token: '+config.byodimapboxes_token+' and password: '+config.byodimapboxes_Pass+' ...');


imapTableAPI.authenticate(config.byodimapboxes_token, config.byodimapboxes_Pass, function(imaperr, accessToken){
	
	if (imaperr) throw imaperr;
	
	if (imaperr==null) {
		debug('Access token:'+accessToken);

        imapTableAPI.query("datasets/"+config.byodimapboxes_ID+"/data", null, null, null, function(imapqerr, data) {

			if (imapqerr) throw imapqerr;

			else {

				data.data.forEach(function(imapel){
					idTable.push(imapel.userID);
				});

				setInterval(function(){
					imapTableAPI.query("datasets/" + config.byodimapboxes_ID + "/data", {userID:{$nin:idTable}}, null, null, function (qerr, qdata) {
	                	if(qerr) throw qerr;
                     	else {
							qdata.data.forEach(function(imapel){
                    			idTable.push(imapel.userID);
                			});

                			qdata.data.forEach(function(imapel){
                    			ImapFetcher(imapel);
                			});

							if (qdata.length) debug(qdata);
						}
	                 });
				}, config.imapboxTimer);

				data.data.forEach(function(imapel){
					ImapFetcher(imapel);
				});

				function ImapFetcher(imapel) {
                    var firstfetch =false;
                    var _mailTableToken;
                    var nmsg = 0;
                    var nnewmsg = 0;
                    var imap = new Imap({
                        user: imapel.imapuserid,
                        password: imapel.imapuserpass,
                        host: imapel.imaphost,
                        port: imapel.imapport,
                        tls: imapel.imaptls,
                        keepalive: {forceNoop: true},
                        debug: function(d) {
                            debug(d)
                        }
                    });

					var mailTableAPI = new TDXApi(config);

					function openInbox(cb) {
  						imap.openBox(imapel.mailboxname, false, cb);
					}

					function fetchMessages(endstr, cb){
						var unseenlistid = [];
						var tabledata = [];
						var f = imap.seq.fetch(endstr, {
                        			bodies: ['HEADER','TEXT'],
                                    struct: true
                                });

                        f.on('message', function(msg, seqno) {
                            var mailtabledata = {uid:0, modseq:'', to:'', from:'', subject:'', date:'', text:'', textcount:0, flags:''};
                        	var mailheader = '';
							var mailbody = '';
							debug('Message #%d', seqno);

                            msg.on('body', function(stream, info) {
                            	var buffer = '';
                            	var count = 0;

                            	stream.on('data', function(chunk) {
                            		count += chunk.length;
                            		buffer += chunk.toString('utf8');
                            	});

                            	stream.once('end', function() {
                            		if (info.which === 'HEADER') {

                                		if (Imap.parseHeader(buffer).date!==undefined)
											mailtabledata.date = Imap.parseHeader(buffer).date.join(',');

										if (Imap.parseHeader(buffer).to!==undefined)
	                                		mailtabledata.to = Imap.parseHeader(buffer).to.join(',');

   										if (Imap.parseHeader(buffer).from!==undefined) 
	                            			mailtabledata.from = Imap.parseHeader(buffer).from.join(',');

										if (Imap.parseHeader(buffer).subject!==undefined)
                                			mailtabledata.subject = Imap.parseHeader(buffer).subject.join(',');

										mailheader = buffer;
                                	} else mailbody = buffer;

                                	mailtabledata.textcount += count;
                            	});
                         	});

                            msg.once('attributes', function(attrs) {
								var labellist = attrs['x-gm-labels'];
                            	mailtabledata.uid = attrs.uid;
                            	mailtabledata.modseq = attrs.modseq;
                            	mailtabledata.flags = attrs.flags.join(',');
								if(labellist.length>0 && attrs.flags.length>0)
									mailtabledata.flags+=',';
								mailtabledata.flags+=labellist.join(',');
						
							});

                            msg.once('end', function() {
								mailtabledata.text = mailheader+mailbody;

								tabledata.push(mailtabledata);
                            	if (mailtabledata.flags.indexOf('\Seen')<0)
                                	unseenlistid.push(seqno.toString());
                            });
                        });

                        f.once('error', function(err) {
                        	debug('Fetch error: ' + err);
							cb([],[],err);
                        });

                        f.once('end', function() {
                            debug('Done fetching all messages!');
                            firstfetch = true;
					
                            cb(tabledata, unseenlistid, null);
                        });
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

    							var endstr='1:*';

								_mailTableToken = mailtableaccessToken;

								function fetchAndSaveMail() {
                                    fetchMessages(endstr, function(tabledata, unseenlistid, fetchmsgerr){
                                        if (fetchmsgerr) debug(fetchmsgerr);
                                        else {
                                            mailTableAPI.addDatasetData(imapel.mailtableid, tabledata, function(mailadddataerr, mailadddatabody){
                                        	    if (mailadddataerr) debug(mailadddataerr);
                                                else {
											        if (unseenlistid.length>0 && config.markAsSeen) {
                                            	        imap.seq.setFlags(unseenlistid, '\Seen', function(setflagerr){
                                                	        if (setflagerr) debug(setflagerr);
                                            	        });
                                        	        }
                                                }
                                            });
                                        }
                                    });
								}

								if (config.truncateOnStart) {
									mailTableAPI.truncateDataset(imapel.mailtableid, _mailTableToken, function (truncateerr, truncatebody){
										if (truncateerr) debug(truncateerr);
                                        else fetchAndSaveMail();
									});
								} else fetchAndSaveMail();
							});

  						});
					});

					imap.on('mail', function(numNewMsgs){
						var endstr, nmsgold = nmsg+1;
						if (firstfetch) {
							nmsg = nmsg + numNewMsgs	
							endstr = nmsgold+':'+nmsg;

                            fetchMessages(endstr, function(tabledata, unseenlistid, fetchmsgerr){
                            	if (fetchmsgerr) debug(fetchmsgerr);
                                else {
                            	    mailTableAPI.addDatasetData(imapel.mailtableid, tabledata, function(mailadddataerr, mailadddatabody){
                            		    if (mailadddataerr) debug(mailadddataerr);
                                        else {
                            		        if (unseenlistid.length>0 && config.markAsSeen) {
                            			        imap.seq.setFlags(unseenlistid, '\Seen', function(setflagerr){
                            				        if (setflagerr) debug(setflagerr);
                            			        }); 
                                            }
                                        }    
                                    });
                                }
                            });
						}
					});

					imap.once('error', function(err) {
  						debug("Imap error:"+err);
					});

					imap.once('end', function() {
  						debug('Connection ended');
					});

					imap.connect();
				}
			}
	    });
    }
});

