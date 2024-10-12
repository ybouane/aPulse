let config;
let lastPulse = 0;
const setError = (text)=>{document.querySelector('error-notice').innerText = text;};
document.addEventListener("DOMContentLoaded", async () => {
	let $main = document.querySelector('main');
	const refreshStatus = async () => {
		try {
			const response = await fetch('./status.json', {cache: "no-cache"});
			if (!response.ok) {
				throw new Error(`Error fetching status.json: ${response.statusText}`);
			}
			setError(''); // Clear errors
			const status = await response.json();
			$main.innerHTML = '';
			config = status.config;
			lastPulse = status.lastPulse;
			for (let [siteId, endpointIds] of status.ui) {
				let site = status.sites[siteId];
				if(!site)
					continue;

				let $site = document.createElement('div');
				$site.classList.add('site');
				let $siteName = document.createElement('h1');
				$siteName.innerText = site.name;
				$site.append($siteName);

				$main.append($site);

				let nEndpoints = 0;
				let endpointPoints = [];
				for (let endpointId of endpointIds) {
					let endpoint = site.endpoints[endpointId];
					if(!endpoint)
							continue;
					nEndpoints++;
					let $endpoint = document.createElement('div');
					$endpoint.classList.add('endpoint');

					$endpointName = document.createElement('h3');
					$endpointName.innerText = endpoint.name;
					if(endpoint.link) {
						let $link = document.createElement('a');
						$link.href = endpoint.link;
						$link.target = '_blank';
						$link.innerHTML = '<span class="icon">open_in_new</span>';
						$endpointName.append($link);
					}
					$endpoint.append($endpointName);

					let $statusBarEndpoint = document.createElement('status-bar');
					endpointPoints.push($statusBarEndpoint.setLogs(endpoint.logs));
					$endpoint.append($statusBarEndpoint);

					$site.append($endpoint);
				}
				if(nEndpoints>1) {
					let $statusBar = document.createElement('status-bar');
					let combinedLogs = [];
					for(let i=0;i<config.nDataPoints;i++) {
						let t = Math.max(...endpointPoints.map(p=>p[i]?.t).filter(p=>p));
						let err = endpointPoints.map(p=>p[i]?.err).filter(p=>p).join("\n") || undefined;
						let ttfb = Math.max(...endpointPoints.map(p=>p[i]?.ttfb).filter(p=>p));
						let dur = Math.max(...endpointPoints.map(p=>p[i]?.dur).filter(p=>p));
						let dns = Math.max(...endpointPoints.map(p=>p[i]?.dns).filter(p=>p));
						let tcp = Math.max(...endpointPoints.map(p=>p[i]?.tcp).filter(p=>p));
						combinedLogs.push({t, err, ttfb, dur, dns, tcp});
					}
					$statusBar.setLogs(combinedLogs);
					$site.querySelector('h1').after($statusBar);
				}
			}
		} catch (error) {
			setError("Error loading server status:", error);
		}
	};
	refreshStatus();
	setInterval(refreshStatus, 60_000); // Refresh every minute
});
const formatDate = (date) => new Intl.DateTimeFormat('en-US', {
	month: 'long',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	hour12: true
}).format(date);

const findClosestPoint = (logs, t, maxDistance=Infinity) => {
	let best;
	for(let log of logs) {
		let d = Math.abs(log.t-t);
		if(d <= maxDistance && (!best || d<Math.abs(best.t-t))) {
			best = log;
		}
	}
	return best;
}

class StatusBar extends HTMLElement {
	constructor() {
		super();
	}
	setLogs(logs) {
		this.innerHTML = '';
		this.logs = logs;
		let points = [];
		let lastDate = lastPulse;
		if(lastPulse < (Date.now() - config.interval*60_000 - 20_000 )) { // Detect when last pulse is too long ago, give grace period of 20sec -> Watcher is probably down, use Date.now
			lastDate = Date.now();
		}
		for(let i=config.nDataPoints-1;i>=0;i--) {
			let date = lastDate - i * config.interval * 60_000;
			let point = findClosestPoint(logs, date, config.interval * 60_000/2);
			points.push(point);
			const $entry = document.createElement('status-bar-entry');
			$entry.setAttribute('tabindex', 0);
			if(point) {
				$entry.innerHTML = `<div>
					<strong>${formatDate(point.t)}</strong>
					<em></em>
				</div>`;
				let status;
				if(point.err) {
					status = 'outage';
					$entry.querySelector('em').before(point.err);
				} else {
					if(point.ttfb > config.responseTimeWarning) {
						status = 'highly-degraded';
					} else if(point.ttfb > config.responseTimeGood) {
						status = 'degraded';
					} else {
						status = 'healthy';
					}
				}
				$entry.setAttribute('data-status', status);
				$entry.querySelector('em').innerText = `Latency: ${point.ttfb.toFixed(2)}ms`;
			} else {
				$entry.setAttribute('data-status', 'none');
				$entry.innerHTML = `<div><strong>No Data</strong></div>`;
			}
			this.append($entry);
		}
		return points;
	}
}
customElements.define('status-bar', StatusBar);
