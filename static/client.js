let config;
document.addEventListener("DOMContentLoaded", async () => {
	let $main = document.querySelector('main');
	const refreshStatus = async () => {
		try {
			const response = await fetch('./status.json');
			if (!response.ok) {
				throw new Error(`Error fetching status.json: ${response.statusText}`);
			}
			const status = await response.json();
			$main.innerHTML = '';
			config = status.config;
			for (let [siteId, endpointIds] of status.ui) {
				let site = status.sites[siteId];
				if(!site)
					continue;

				let $site = document.createElement('div');
				$site.classList.add('site');
				let $siteName = document.createElement('h1');
				$siteName.innerText = site.name;
				$site.append($siteName);

				let $statusBar = document.createElement('status-bar');
				$statusBar.logs = '';
				$site.append($statusBar);
				$main.append($site);

				for (let endpointId of endpointIds) {
					let endpoint = site.endpoints[endpointId];
					if(!endpoint)
							continue;
					let $endpoint = document.createElement('div');
					$endpoint.classList.add('endpoint');

					$endpointName = document.createElement('h3');
					$endpointName.innerText = endpoint.name;
					$endpoint.append($endpointName);

					let $statusBarEndpoint = document.createElement('status-bar');
					$statusBarEndpoint.logs = endpoint.logs;
					$endpoint.append($statusBarEndpoint);

					$site.append($endpoint);
				}
			}
		} catch (error) {
			console.error("Error loading server status:", error);
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

	set logs(logs) {
		console.log(logs);
		this.innerHTML = '';
		this.logs_ = logs;
		let now = Date.now();
		for(let i=config.nDataPoints;i>0;i--) {
			let date = now - i * config.interval * 60_000;
			let point = findClosestPoint(logs, date, config.interval * 60_000/2);
			const $entry = document.createElement('status-bar-entry');
			$entry.setAttribute('tabindex', 0);
			if(point) {
				$entry.innerHTML = `<div>
	<strong>${formatDate(point.t)}</strong>
	<em></em>
</div>`;
				if(point.err) {
					$entry.setAttribute('data-status', 'outage');
					$entry.querySelector('em').innerText = point.err;
				} else {
					if(point.dur > config.responseTimeWarning) {
						$entry.setAttribute('data-status', 'highly-degraded');
					} else if(point.dur > config.responseTimeGood) {
						$entry.setAttribute('data-status', 'degraded');
					} else {
						$entry.setAttribute('data-status', 'healthy');
					}
				}
				$entry.querySelector('em').innerText = point.ttfb.toFixed(2)+'ms';
			} else {
				$entry.setAttribute('data-status', 'none');
				$entry.innerHTML = `<div><strong>No Data</strong></div>`;
			}
			this.append($entry);
			
		}
	}
}
customElements.define('status-bar', StatusBar);
