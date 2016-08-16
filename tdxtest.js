var config = require("./config");
var tdxAPI = (new (require("nqm-api-tdx"))(config));

tdxAPI.authenticate(config.byodimapboxes_token, config.byodimapboxes_Pass, function(err, accessToken){
	if (err==null) {
		tdxAPI.query("datasets/"+config.byodimapboxes_ID+"/data", null, null, null, function(qerr, data) {
			console.log(data);
			if(qerr) throw qerr;
		});
	}
});

