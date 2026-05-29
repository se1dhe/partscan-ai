package app.partscan.controller;
import app.partscan.dto.ScanResponse;
import app.partscan.service.ScanService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/scan")
public class ScanController {
 private final ScanService scanService;

 public ScanController(ScanService scanService) {
  this.scanService = scanService;
 }

 @PostMapping
 public ScanResponse scan(@RequestParam MultipartFile file){
   if (file == null || file.isEmpty()) throw new IllegalArgumentException("Image file is required");
   return scanService.scan(file);
 }
}
