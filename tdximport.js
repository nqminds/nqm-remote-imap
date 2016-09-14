var config = require("./config");
var tdxAPI = (new (require("nqm-api-tdx"))(config));
var fs = require('fs');

var data = require("./"+process.argv[2]);

tdxAPI.authenticate(config.byodimapboxes_token, config.byodimapboxes_Pass, function(err, accessToken){
	
	if (err==null) {
		console.log(accessToken);

		tdxAPI.addDatasetData(config.byodimapboxes_ID, data, function(dataerr, datares){
			if(dataerr) throw dataerr;
			else console.log("Done:"+datares.length);
		});
	} else throw err;
});

