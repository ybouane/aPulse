import {promises as fs, watchFile} from 'fs';
let config = (await import('./config.js')).default;

watchFile('./config.js', async ()=>{ // Dynamically reload config and watch it for changes.
	try {
		config = (await import('./config.js?refresh='+Date.now())).default;
		console.log('Reloaded config file.')
	} catch(e) {
		console.error(e);
	}
});

const statusFile = './static/status.json';

const delay  = async t=>new Promise(r=>setTimeout(r, t));
const handlize = s=>s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, '-');
const checkContent = async (content, criterion, negate=false) => {
	if(typeof criterion=='string') {
		return content.includes(criterion)!=negate;
	} else if(Array.isArray(criterion)) {
		return criterion[negate?'some':'every'](c=>content.includes(c))!=negate;
	} else if(criterion instanceof RegExp) {
		return (!!content.match(criterion))!=negate;
	} else if(typeof criterion=='function') {
		return (!!await Promise.resolve(criterion(content)))!=negate;
	} else {
		throw new Error('Invalid content check criterion.')
	}
};
const sendTelegramMessage = async (text) => {
	const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			chat_id: config.telegram.chatId,
			text: text,
		}),
	});
	if (!response.ok) {
		throw new Error(`[Telegram] Failed to send message: ${response.statusText}`);
	}
	return await response.json();
};
const sendDiscordMessage = async (text) => {
	const webhookUrl = 'YOUR_DISCORD_WEBHOOK_URL';
	const response = await fetch(config.discord.webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content: text
		})
	});
	if (!response.ok) {
		throw new Error(`[Discord] Failed to send message: ${response.statusText}`);
	}
	return await response.json();
};
const sendSMSMessage = async (text) => {
	const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Authorization': `Basic ${Buffer.from(`${config.twilio.accountSid}:${config.twilio.accountToken}`).toString('base64')}`
		},
		body: new URLSearchParams({
			To: config.twilio.toNumber,
			From: config.twilio.twilioNumber,
			Body: text
		})
	});
	if (!response.ok) {
		throw new Error(`[Twilio-SMS] Failed to send message: ${response.statusText}`);
	}
	return await response.json();
};
const sendSlackMessage = async (text) => {
	const url = 'https://slack.com/api/chat.postMessage';
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.slack.botToken}`
		},
		body: JSON.stringify({
			channel: config.slack.channelId,
			text: text,
		})
	});
	if (!response.ok) {
		throw new Error(`[Slack] Failed to send message: ${response.statusText}`);
	}
	return await response.json();
};
const sendEmailMessage = async (text) => {
	const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.sendgrid.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			personalizations: [{ to: [{ email: config.sendgrid.toEmail }] }],
			from: { email: config.sendgrid.toFromEmail },
			subject: "aPulse — Server Status Notification",
			content: [{ type: "text/plain", value: text }]
		})
	});
	if (!response.ok) {
		throw new Error(`[SendGrid-Email] Failed to send message: ${response.statusText}`);
	}
	return await response.json();
};
const sendNotification = async (message) => {
	if(config.telegram?.botToken && config.telegram?.chatId)
		await sendTelegramMessage(message);
	if(config.slack?.botToken && config.slack?.channelId)
		await sendSlackMessage(message);
	if(config.discord?.webhookUrl)
		await sendDiscordMessage(message);
	if(config.twilio?.accountSid && config.twilio?.accountToken && config.twilio?.toNumber && config.twilio?.twilioNumber)
		await sendSMSMessage(message);
	if(config.sendgrid?.apiKey && config.sendgrid?.toEmail && config.sendgrid?.toFromEmail)
		await sendEmailMessage(message);
}

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
		status.config = {
			interval				: config.interval,
			nDataPoints				: config.nDataPoints,
			responseTimeGood		: config.responseTimeGood,
			responseTimeWarning		: config.responseTimeWarning,
		};

		status.ui = [];

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

			let endpointIds = [];
			status.ui.push([siteId, endpointIds]);
			try {
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
					if(endpoint.link!==false)
						endpoint_.link = endpoint.link || endpoint.url;
					endpoint_.logs = endpoint_.logs || [];
					let start;
					
					try {
						performance.clearResourceTimings();
						start = performance.now();
						let response = await fetch(endpoint.url, {
							signal: AbortSignal.timeout(config.timeout),
							...endpoint.request,
						});
						let content = await response.text();
						await delay(0); // Ensures that the entry was registered.
						let perf = performance.getEntriesByType('resource')[0];
						if(perf) {
							endpointStatus.dur = perf.responseEnd - perf.startTime; // total request duration
							endpointStatus.dns = perf.domainLookupEnd - perf.domainLookupStart; // DNS Lookup
							endpointStatus.tcp = perf.connectEnd - perf.connectStart; // TCP handshake time
							endpointStatus.ttfb = perf.responseStart - perf.requestStart; // time to first byte -> Latency
							endpointStatus.dll = perf.responseEnd - perf.responseStart; // time for content download
						} else { // backup in case entry was not registered
							endpointStatus.dur = performance.now() - start;
							endpointStatus.ttfb = endpointStatus.dur;
							config.verbose && console.log(`\tCould not use PerformanceResourceTiming API to measure request.`);
						}

						// HTTP Status Check
						if(!endpoint.validStatus && !response.ok) {
							endpointStatus.err = `HTTP Status ${response.status}: ${response.statusText}`;
							continue;
						} else if(endpoint.validStatus && ((Array.isArray(endpoint.validStatus) && !endpoint.validStatus.includes(response.status)) || (!Array.isArray(endpoint.validStatus) && endpoint.validStatus!=response.status))) {
							endpointStatus.err = `HTTP Status ${response.status}: ${response.statusText}`;
							continue;
						}

						// Content checks
						if(endpoint.mustFind && !await checkContent(content, endpoint.mustFind)) {
							endpointStatus.err = '"mustFind" check failed';
							continue;
						}
						if(endpoint.mustNotFind && !await checkContent(content, endpoint.mustNotFind, true)) {
							endpointStatus.err = '"mustNotFind" check failed';
							continue;
						}
						if(endpoint.customCheck && typeof endpoint.customCheck == 'function' && !await Promise.resolve(endpoint.customCheck(content, response))) {
							endpointStatus.err = '"customCheck" check failed';
							continue;
						}
					} catch(e) {
						endpointStatus.err = String(e);
						if(!endpointStatus.dur) {
							endpointStatus.dur = performance.now() - start;
							endpointStatus.ttfb = endpointStatus.dur;
						}
					} finally {
						endpoint_.logs.push(endpointStatus);
						if(endpoint_.logs.length > config.logsMaxDatapoints) // Remove old datapoints
							endpoint_.logs.splice(0, endpoint_.logs.length - config.logsMaxDatapoints);
						if(endpointStatus.err) {
							endpoint.consecutiveErrors = (endpoint.consecutiveErrors || 0) + 1;
							endpoint.consecutiveHighLatency = 0;
							config.verbose && console.log(`\t🔥 ${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]`);
							config.verbose && console.log(`\t→ ${endpointStatus.err}`);
							try {
								if(endpoint.consecutiveErrors>=config.consecutiveErrorsNotify) {
									/*await*/ sendNotification( // Don't await to prevent blocking/delaying next pulse
										`🔥 ERROR\n`+
										`${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]\n`+
										`→ ${endpointStatus.err}`+
										(endpoint.link!==false?`\n→ ${endpoint.link || endpoint.url}`:'')
									);
								}
							} catch(e) {console.error(e);}
						} else {
							endpoint.consecutiveErrors = 0;
							let emoji = '🟢';
							if(endpointStatus.ttfb>config.responseTimeWarning) {
								emoji = '🟥';
								endpoint.consecutiveHighLatency = (endpoint.consecutiveHighLatency || 0) + 1;
							} else {
								endpoint.consecutiveHighLatency = 0;
								if(endpointStatus.ttfb>config.responseTimeGood)
									emoji = '🔶';
							}
							config.verbose && console.log(`\t${emoji} ${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]`);
							try {
								if(endpoint.consecutiveHighLatency>=config.consecutiveHighLatencyNotify) {
									/*await*/ sendNotification( // Don't await to prevent blocking/delaying next pulse
										`🟥 High Latency\n`+
										`${site.name || siteId} — ${endpoint.name || endpointId} [${endpointStatus.ttfb.toFixed(2)}ms]\n`+
										(endpoint.link!==false?`\n→ ${endpoint.link || endpoint.url}`:'')
									);
								}
							} catch(e) {console.error(e);}
						}
					}
				}
			} catch(e) {
				console.error(e);
			}
			config.verbose && console.log(' ');//New line
		}
		status.lastPulse = Date.now();
		await fs.writeFile(statusFile, JSON.stringify(status, undefined, config.readableStatusJson?2:undefined));
	} catch(e) {
		console.error(e);
	}
	config.verbose && console.log('✅ Done');
	await delay(config.interval * 60_000 - (Date.now() - startPulse));
}