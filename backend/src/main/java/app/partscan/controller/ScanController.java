package app.partscan.controller;

import app.partscan.dto.ScanResponse;
import app.partscan.service.ScanService;
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

 public ScanController(ScanService scanService) {
  this.scanService = scanService;
 }

 @PostMapping
 public ScanResponse scan(
  @RequestParam(required = false) MultipartFile file,
  @RequestParam(required = false) List<MultipartFile> files
 ) {
  List<MultipartFile> images = new ArrayList<>();
  if (file != null && !file.isEmpty()) images.add(file);
  if (files != null) files.stream().filter(item -> item != null && !item.isEmpty()).forEach(images::add);
  if (images.isEmpty()) throw new IllegalArgumentException("At least one image file is required");
  return scanService.scan(images);
 }
}
