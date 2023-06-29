const cluster = require('cluster');
var fs = require('fs');
var path = require('path');
var Website = require('./libs/website.js');
const loggerFactory = require('./libs/logger.js');
const logger = loggerFactory.getLogger('init.js', 'system');
var algos = require('./stratum/algoProperties.js');


JSON.minify = JSON.minify || require("node-json-minify");



// var numWorkers = require('os').cpus().length;

// if (cluster.isPrimary) {
//     console.log("numworkers = ", numWorkers);
//     for(var i = 0; i < 4; i++) {
//         cluster.fork({
//             workerType: 'website',
//         });
//     }
// } else {
//     console.log(cluster.workerType);
// }

var portalConfig = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));
var poolConfigs;

var buildPoolConfigs = function () {
	var configs = {};
	var configDir = 'pool_configs/';
	var poolConfigFiles = [];
	fs.readdirSync(configDir).forEach(function (file) {
		if (!fs.existsSync(configDir + file) || path.extname(configDir + file) !== '.json') return;
		var poolOptions = JSON.parse(JSON.minify(fs.readFileSync(configDir + file, {encoding: 'utf8'})));
		if (!poolOptions.enabled) return;
		poolOptions.fileName = file;
		poolConfigFiles.push(poolOptions);
	});
	for (var i = 0; i < poolConfigFiles.length; i++) {
		var ports = Object.keys(poolConfigFiles[i].ports);
		for (var f = 0; f < poolConfigFiles.length; f++) {
			if (f === i) continue;
			var portsF = Object.keys(poolConfigFiles[f].ports);
			for (var g = 0; g < portsF.length; g++) {
				if (ports.indexOf(portsF[g]) !== -1) {
					logger.error(poolConfigFiles[f].fileName, 'Has same configured port of ' + portsF[g] + ' as ' + poolConfigFiles[i].fileName);
					process.exit(1);
					return;
				}
			}
			if (poolConfigFiles[f].coin === poolConfigFiles[i].coin) {
				logger.error(poolConfigFiles[f].fileName, 'Pool has same configured coin file coins/' + poolConfigFiles[f].coin + ' as ' + poolConfigFiles[i].fileName + ' pool');
				process.exit(1);
				return;
			}
		}
	}
	poolConfigFiles.forEach(function (poolOptions) {
		poolOptions.coinFileName = poolOptions.coin;
		var coinFilePath = 'coins/' + poolOptions.coinFileName;
		if (!fs.existsSync(coinFilePath)) {
			logger.error('[%s] could not find file %s ', poolOptions.coinFileName, coinFilePath);
			return;
		}
		var coinProfile = JSON.parse(JSON.minify(fs.readFileSync(coinFilePath, {encoding: 'utf8'})));
		poolOptions.coin = coinProfile;
		poolOptions.coin.name = poolOptions.coin.name.toLowerCase();
		if (poolOptions.coin.name in configs) {
			logger.error('%s coins/' + poolOptions.coinFileName + ' has same configured coin name '
			+ poolOptions.coin.name + ' as coins/'
			+ configs[poolOptions.coin.name].coinFileName + ' used by pool config '
			+ configs[poolOptions.coin.name].fileName, poolOptions.fileName);
			process.exit(1);
			return;
		}
		for (var option in portalConfig.defaultPoolConfigs) {
			if (!(option in poolOptions)) {
				var toCloneOption = portalConfig.defaultPoolConfigs[option];
				var clonedOption = {};
				if (toCloneOption.constructor === Object) {
					Object.assign(clonedOption, toCloneOption);
				} else {
					clonedOption = toCloneOption;
				}
				poolOptions[option] = clonedOption;
			}
		}
		configs[poolOptions.coin.name] = poolOptions;
		if (!(coinProfile.algorithm in algos)) {
			logger.error('[%s] Cannot run a pool for unsupported algorithm "' + coinProfile.algorithm + '"', coinProfile.name);
			delete configs[poolOptions.coin.name];
		}
	});
	return configs;
};

// if (cluster.isWorker) {
//     switch (process.env.workerType) {
//         case 'website':
// 		new Website();
// 		break;
//     }
// }
// //console.log(cluster.workers);

var startWebsite = function () {
	if (!portalConfig.website.enabled) return;
	var worker = cluster.fork({
		workerType: 'website',
		pools: JSON.stringify(poolConfigs),
		portalConfig: JSON.stringify(portalConfig)
	});
	worker.on('exit', function (code, signal) {
		logger.error('Master', 'Website', 'Website process died, spawning replacement...');
		setTimeout(function () {
			startWebsite(portalConfig, poolConfigs);
		}, 2000);
	});
};

(function init() {
    poolConfigs = buildPoolConfigs();
    console.log(poolConfigs);
	// setTimeout(function() {
	// 	startWebsite();
	// }, 2000);
})();

