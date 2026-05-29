package app.partscan.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/scan")
public class ScanController {
 @PostMapping
 public Map<String,Object> scan(@RequestParam MultipartFile file){
   return Map.of("status","accepted","filename",file.getOriginalFilename());
 }
}
