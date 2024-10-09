document.addEventListener("DOMContentLoaded", async () => {
	let $main = document.querySelector('main');
	const refreshStatus = async () => {
		try {
			const response = await fetch('./status.json');
			if (!response.ok) {
				throw new Error(`Error fetching status.json: ${response.statusText}`);
			}
			const status = await response.json();
			console.log(status);
			for (let [siteId, endpointIds] of status.ui) {
				let site = status[siteId];

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