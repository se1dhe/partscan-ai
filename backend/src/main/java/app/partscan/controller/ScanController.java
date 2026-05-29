package app.partscan.controller;

import app.partscan.dto.ScanResponse;
import app.partscan.service.ScanRateLimiterService;
import app.partscan.service.ScanService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/scan")
public class ScanController {
 private final ScanService scanService;
 private final ScanRateLimiterService rateLimiterService;

 public ScanController(ScanService scanService, ScanRateLimiterService rateLimiterService) {
  this.scanService = scanService;
  this.rateLimiterService = rateLimiterService;
 }

 @PostMapping
 public ScanResponse scan(
  @RequestParam(required = false) MultipartFile file,
  @RequestParam(required = false) List<MultipartFile> files,
  HttpServletRequest request
 ) {
  String clientKey = clientKey(request);
  if (!rateLimiterService.isAllowed(clientKey)) {
   long retryAfter = rateLimiterService.retryAfterSeconds(clientKey);
   return ScanResponse.rateLimited(
    "Слишком частые сканы. Подождите " + retryAfter + " сек.",
    "Держите деталь в кадре, повторный анализ включится автоматически."
   );
  }

  List<MultipartFile> images = new ArrayList<>();
  if (file != null && !file.isEmpty()) images.add(file);
  if (files != null) files.stream().filter(item -> item != null && !item.isEmpty()).forEach(images::add);
  if (images.isEmpty()) throw new IllegalArgumentException("At least one image file is required");
  return scanService.scan(images);
 }

 private String clientKey(HttpServletRequest request) {
  String forwardedFor = request.getHeader("X-Forwarded-For");
  if (forwardedFor != null && !forwardedFor.isBlank()) return forwardedFor.split(",")[0].trim();
  String realIp = request.getHeader("X-Real-IP");
  if (realIp != null && !realIp.isBlank()) return realIp.trim();
  return request.getRemoteAddr();
 }
}