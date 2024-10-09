const engine = new liquidjs.Liquid();
document.addEventListener("DOMContentLoaded", async () => {
	let $main = document.querySelector('main');
	const templateLiquid = document.querySelector("template#site").innerHTML;
	const template = await engine.parse(templateLiquid);
	
	const refreshStatus = async () => {
		try {
			const response = await fetch('/status.json');
			if (!response.ok) {
				throw new Error(`Error fetching status.json: ${response.statusText}`);
			}
			const status = await response.json();
			
			$main.innerHTML = template.render(status);

		} catch (error) {
			console.error("Error loading server status:", error);
		}
	};
	setInterval(refreshStatus, 60_000); // Refresh every minute
});