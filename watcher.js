import config from './config.js';
import fs from 'fs/promises';

const statusFile = './static/status.json';

const delay  = async t=>new Promise(r=>setTimeout(r, t));
const handlize = s=>s.toLowerCase().replace(/[^a-z0-9]/, ' ').trim().replace(/\s{2,}/g, '-');
const checkContent = async (content, criterion) => {
	if(typeof criterion=='string') {
		return content.includes(criterion);
	} else if(criterion instanceof RegExp) {
		return content.match(criterion);
	} else if(typeof criterion=='function') {
		if(criterion.constructor.name == 'AsyncFunction') {
			return criterion(content);
		} else {
			return await criterion(content);
		}
	} else {
		throw new Error('Invalid content check criterion.')
	}
};

while(true) {
	config.verbose && console.log('🔄 Pulse');
	let startPulse = Date.now();
	let status;
	try {
		try {
			status = JSON.parse((await fs.readFile(statusFile)).toString()); // We re-read the file each time in case it was manually modified.
		} catch(e) {console.error(`Could not find status.json file [${statusFile}], will create it.`)}
		status = status || {};
		status.sites = status.sites || {};
		status.lastPulse = startPulse;
		status.config = {
			interval				: config.interval,
			responseTimeGood		: config.responseTimeGood,
			responseTimeWarning		: config.responseTimeWarning,
		};

		let siteIds = [];
		for(let site of config.sites) {
			config.verbose && console.log(`⏳ Site: ${site.name || site.id}`);
			let siteId = site.id || handlize(site.name) || 'site';
			let i = 1; let siteId_ = siteId;
			while(siteIds.includes(siteId)) {siteId = siteId_+'-'+(++i)} // Ensure a unique site id
			siteIds.push(siteId);

			status.sites[siteId] = status.sites[siteId] || {};
			let site_ = status.sites[siteId]; // shortcut ref
			site_.name = site.name || site_.name;
			site_.endpoints = site_.endpoints || {};
			try {
				let endpointIds = [];
				for(let endpoint of site.endpoints) {
					let endpointStatus = {
						t	: Date.now(),// time
					};
					config.verbose && console.log(`\tFetching endpoint: ${endpoint.url}`);
					let endpointId = endpoint.id || handlize(endpoint.name) || 'endpoint';
					let i = 1; let endpointId_ = endpointId;
					while(endpointIds.includes(endpointId)) {endpointId = endpointId_+'-'+(++i)} // Ensure a unique endpoint id
					endpointIds.push(endpointId);

					site_.endpoints[endpointId] = site_.endpoints[endpointId] || {};
					let endpoint_ = site_.endpoints[endpointId]; // shortcut ref
					endpoint_.name = endpoint.name || endpoint_.name;
					endpoint_.logs = endpoint_.logs || [];
					let start;
					
					try {
						performance.clearResourceTimings();
						start = performance.now();
						let response = await fetch(endpoint.url, endpoint.request, { signal: AbortSignal.timeout(config.timeout) });
						let content = await response.text();
						await delay(0); // Ensures that the entry was registered.
						let perf = performance.getEntriesByType('resource')[0];
						if(perf) {
							endpointStatus.dur = perf.responseEnd - perf.startTime; // total request duration
							//endpointStatus.dns = perf.domainLookupEnd - perf.domainLookupStart;
							//endpointStatus.tcp = perf.connectEnd - perf.connectStart;
							endpointStatus.ttfb = perf.responseStart - perf.requestStart; // time to first byte
							endpointStatus.dll = perf.responseEnd - perf.responseStart; // time for content download
						} else { // backup in case entry was not registered
							endpointStatus.dur = performance.now() - start;
							endpointStatus.ttfb = endpointStatus.dur;
							endpointStatus.dll = 0;
							config.verbose && console.log(`\tCould not use PerformanceResourceTiming API to measure request.`);
						}
						if(!endpoint.validStatus && !response.ok) {
							endpointStatus.err = `HTTP Status ${response.status}: ${response.statusText}`;
							continue;
						} else if((Array.isArray(endpoint.validStatus) && !endpoint.validStatus.includes(response.status)) || (!Array.isArray(endpoint.validStatus) && endpoint.validStatus!=response.status)) {
							endpointStatus.err = `HTTP Status ${response.status}: ${response.statusText}`;
							continue;
						}
						if(endpoint.mustFind && !await checkContent(content, endpoint.mustFind)) {
							endpointStatus.err = '"mustFind" check failed';
							continue;
						}
						if(endpoint.mustNotFind && await checkContent(content, endpoint.mustNotFind)) {
							endpointStatus.err = '"mustNotFind" check failed';
							continue;
						}
					} catch(e) {
						endpointStatus.err = String(e);
						if(!endpointStatus.dur) {
							endpointStatus.dur = performance.now() - start;
							endpointStatus.ttfb = endpointStatus.dur;
							endpointStatus.dll = 0;
						}
					} finally {
						endpoint_.logs.push(endpointStatus);
						if(endpoint_.logs.length > config.logsMaxDatapoints) // Remove old datapoints
							endpoint_.logs = endppoint_.logs.splice(0, endpoint_.logs.length - config.logsMaxDatapoints);
						if(config.verbose) {
							if(endpointStatus.err) {
								console.log(`\t🔥 ${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]`);
								console.log(`\t→ ${endpointStatus.err}`);
							} else {
								let emoji = '🟢';
								if(endpointStatus.ttfb>config.responseTimeWarning)
									emoji = '🟥';
								else if(endpointStatus.ttfb>config.responseTimeGood)
									emoji = '🔶';
								console.log(`\t${emoji} ${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]`);
							}
						}
					}
				}
			} catch(e) {
				console.error(e);
			}
		}
		await fs.writeFile(statusFile, JSON.stringify(status, undefined, config.readableStatusJson?2:undefined));
	} catch(e) {
		console.error(e);
	}
	config.verbose && console.log('✅ Done');
	await delay(config.interval * 60_000 - (Date.now() - startPulse));
}