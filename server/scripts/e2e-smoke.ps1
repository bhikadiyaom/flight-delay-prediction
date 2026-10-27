# End-to-end smoke test against a RUNNING stack (dev-db + ml-service + server). Usage:
#   $env:ADMIN_EMAILS="e2e-admin@example.com"  (start the server with it), then: pwsh scripts/e2e-smoke.ps1
param([string]$Base = 'http://127.0.0.1:5000/api/v1')
$ErrorActionPreference = 'Stop'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
function Call($method, $path, $body, $token, $form) {
  $h = @{}; if ($token) { $h['Authorization'] = "Bearer $token" }
  try {
    if ($body) { return Invoke-RestMethod "$Base$path" -Method $method -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6) }
    return Invoke-RestMethod "$Base$path" -Method $method -Headers $h
  } catch { return @{ __status = [int]$_.Exception.Response.StatusCode; __body = $_.ErrorDetails.Message } }
}
function Show($name, $value) { "{0,-42} {1}" -f $name, $value }

$h = Call Get '/health'
Show 'health' "$($h.status) db=$($h.db.connected) ml=$($h.ml.reachable) model=$($h.ml.modelVersion)"

$u = Call Post '/auth/register' @{ name = 'E2E User'; email = "e2e-$stamp@example.com"; password = 'Password123' }
Show 'register' "role=$($u.user.role)"
$a = Call Post '/auth/register' @{ name = 'E2E Admin'; email = 'e2e-admin@example.com'; password = 'Password123' }
if ($a.__status -eq 409) { $a = Call Post '/auth/login' @{ email = 'e2e-admin@example.com'; password = 'Password123' } }
Show 'admin account' "role=$($a.user.role)"
$me = Call Get '/users/me' $null $u.token
Show 'GET /users/me' $me.user.email

$l = Call Get '/flights/live?flight=aa%20100'
Show 'flights/live AA100 (no key => demo)' "source=$($l.source) demo=$($l.demo) $($l.flight.origin.iata)->$($l.flight.destination.iata) wx.origin.prcp=$($l.weather.origin.precipitationMm)"
$r = Call Get '/flights/live/route?origin=JFK&destination=LAX'
Show 'flights/live/route JFK-LAX' "n=$($r.flights.Count) source=$($r.source)"

$p = Call Post '/predictions/live' @{ flight = 'DL400' } $u.token
Show 'predictions/live DL400' ("source=$($p.source) delay={0:P1} cancel={1:P1} risk=$($p.prediction.riskLevel) minutes=$($p.prediction.predictedDelayMinutes)" -f $p.prediction.delayProbability, $p.prediction.cancelProbability)
Show '  top factors' (($p.prediction.topFactors | ForEach-Object { "$($_.feature)=$($_.value)" }) -join ', ')
Show '  warnings' (($p.prediction.warnings) -join ' | ')

$m = Call Post '/predictions' @{ airline = 'United'; origin = 'ORD'; destination = 'LGA'; scheduledDeparture = '2026-12-22T17:30:00'; originWeather = @{ temperatureC = -6; temperatureMinC = -10; precipitationMm = 14; snowfallCm = 9; windSpeedKmh = 42 } }
Show 'predictions (snowy ORD evening)' ("delay={0:P1} cancel={1:P1} risk=$($m.prediction.riskLevel)" -f $m.prediction.delayProbability, $m.prediction.cancelProbability)
$c = Call Post '/predictions' @{ airline = 'United'; origin = 'ORD'; destination = 'LGA'; scheduledDeparture = '2026-12-22T17:30:00'; originWeather = @{ temperatureC = -6; temperatureMinC = -10; precipitationMm = 14; snowfallCm = 9; windSpeedKmh = 42 } }
Show '  repeat (10-min cache)' "cached=$($c.cached)"

$csv = "airline,origin,destination,scheduled_departure`nDL,ATL,JFK,2026-12-22T09:00:00`nUA,ORD,SFO,2026-12-22T11:15:00`nWN,DEN,LAS,bad-date"
$tmp = Join-Path $env:TEMP "bulk-$stamp.csv"; Set-Content $tmp $csv -Encoding ascii
$bulk = & curl.exe -s -X POST "$Base/predictions/bulk" -H "Authorization: Bearer $($u.token)" -F "file=@$tmp;type=text/csv" | ConvertFrom-Json
Show 'predictions/bulk' "total=$($bulk.summary.total) ok=$($bulk.summary.ok) failed=$($bulk.summary.failed) row4=$($bulk.results[2].errors[0])"

$s = Call Post '/saved-searches' @{ type = 'route'; label = 'NYC to LA'; origin = 'jfk'; destination = 'lax'; alert = @{ enabled = $true; threshold = 0.3 } } $u.token
Show 'saved-searches create' "id=$($s.item.id.Substring(0,6))... alert=$($s.item.alert.enabled)"
Show 'saved-searches list' "n=$((Call Get '/saved-searches' $null $u.token).items.Count)"
$hist = Call Get '/predictions/history?limit=5' $null $u.token
Show 'predictions/history' "total=$($hist.total)"

$hs = Call Get '/flights/historical?origin=ATL&dest=JFK&limit=3'
Show 'flights/historical ATL-JFK' "flights=$($hs.summary.flights) delay_rate=$($hs.summary.delay_rate)"
$ov = Call Get '/analytics/overview'
Show 'analytics/overview' "flights=$($ov.totals.flights) cached=$($ov.cached)"
$ov2 = Call Get '/analytics/overview'
Show '  second call' "cached=$($ov2.cached)"
Show 'analytics/risk-map' "airports=$((Call Get '/analytics/risk-map').airports.Count)"
Show 'analytics/trends month' "points=$((Call Get '/analytics/trends?granularity=month').points.Count)"
$cmp = Call Get '/analytics/models/compare'
Show 'analytics/models/compare' "models=$($cmp.models.Count) production=$($cmp.production_model)"
Show 'flights/airports?q=chi' (((Call Get '/flights/airports?q=chi').airports | ForEach-Object { $_.iata }) -join ',')

Show 'admin as normal user' ((Call Get '/admin/stats' $null $u.token).__status)
$r = Call Post '/admin/metrics/refresh' $null $a.token
Show 'admin metrics refresh' "version=$($r.version) upserted=$($r.upserted)"
$st = Call Get '/admin/stats' $null $a.token
Show 'admin stats' "users=$($st.users.total) predictions=$($st.predictions.total) avgLatencyMs=$($st.performance.avgLatencyMs) quota=$($st.aviationStackQuota.used)/$($st.aviationStackQuota.limit)"
Show 'admin predictions' "total=$((Call Get '/admin/predictions?limit=3' $null $a.token).total)"
