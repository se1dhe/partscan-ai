package app.partscan.service;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ScanRateLimiterService {
 private static final Duration MIN_INTERVAL = Duration.ofSeconds(4);
 private static final Duration ENTRY_TTL = Duration.ofMinutes(10);
 private final Map<String, Instant> lastScanByClient = new ConcurrentHashMap<>();

 public boolean isAllowed(String clientKey) {
  cleanupOldEntries();
  Instant now = Instant.now();
  Instant previous = lastScanByClient.get(clientKey);
  if (previous != null && Duration.between(previous, now).compareTo(MIN_INTERVAL) < 0) return false;
  lastScanByClient.put(clientKey, now);
  return true;
 }

 public long retryAfterSeconds(String clientKey) {
  Instant previous = lastScanByClient.get(clientKey);
  if (previous == null) return 0;
  long elapsed = Duration.between(previous, Instant.now()).toSeconds();
  return Math.max(0, MIN_INTERVAL.toSeconds() - elapsed);
 }

 private void cleanupOldEntries() {
  Instant threshold = Instant.now().minus(ENTRY_TTL);
  lastScanByClient.entrySet().removeIf(entry -> entry.getValue().isBefore(threshold));
 }
}
