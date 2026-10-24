# Miner compatibility

Bitaxe Fleet is an independent monitoring dashboard. It does not configure mining hardware. The maintainer has tested **Bitaxe Gamma 601**; no broader hardware or firmware verification is claimed.

| Miner                                                                  | Status            | Notes                                                                                                         |
| ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Bitaxe Gamma 601                                                       | Maintainer-tested | The tested board. Exact firmware-version coverage has not been catalogued; available readings may vary.       |
| Other Gamma revisions                                                  | Unverified        | Other 600-series revisions have not been tested with this dashboard.                                          |
| Bitaxe Max, Ultra, Supra, Gamma Turbo                                  | Unverified        | These AxeOS model families have not been tested with this dashboard.                                          |
| Other AxeOS-based miners                                               | Unverified        | A successful connection check validates required telemetry fields, not complete model/firmware compatibility. |
| Devices without compatible AxeOS telemetry, including USB-only devices | Not supported     | A reachable AxeOS monitoring API on a private IPv4 address is required.                                       |

## Connection requirements

The dashboard reads `GET /api/system/info` from the miner. It needs numeric `hashRate`, `power`, and `temp` readings, plus `macAddr` and `ASICModel` for registration. The computer or container running the app must be able to reach the miner. Use a private IPv4 address; public addresses, hostnames, alternate ports, and redirects are not accepted by the registration flow.

A probe reporting `boardVersion: "601"` and `ASICModel: "BM1370"` is labelled **Matches tested model: Bitaxe Gamma 601**. Missing or other metadata is labelled **Unverified**, even when telemetry can be read. Registration remains available for valid AxeOS responses from unverified models, with that limitation shown before confirmation.

The [official Gamma 601 configuration](https://github.com/bitaxeorg/ESP-Miner/blob/master/configs/config-601.csv) identifies board 601, Gamma, and BM1370. The [official AxeOS API definition](https://github.com/bitaxeorg/ESP-Miner/blob/master/main/http_server/openapi.yaml) documents the telemetry endpoint and board metadata. Upstream hardware and API documentation describe the interface; they do not establish that this independent dashboard has tested every listed device.

## Reporting additional testing

Include the model, board revision, AxeOS firmware version, which readings worked or were missing, and a sanitized error if relevant. Share only those details. Raw system-info responses may include local-network and pool identity information; do not attach them without removing private fields. Do not include miner IP/MAC addresses, wireless settings, wallet details, or credentials in public reports.
