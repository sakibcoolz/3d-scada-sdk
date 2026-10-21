# Security policy

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button (Security → Advisories) on this repository rather than in a public issue. Include the affected package and version, a reproduction, and the impact you see.

Areas of particular interest: scene-file parsing and validation (`@scada3d/core`), the SVG sanitizer (`@scada3d/asset-import`), and anything that could let untrusted scene or telemetry data execute code or reach the network.

The SDK visualises and simulates only; it has no PLC write path. Reports are acknowledged as soon as practical; fixes are released as patch versions.
