package app.partscan.controller;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@RequestMapping("/api/v1")
public class HealthController {
 @GetMapping("/health")
 public Map<String,String> health(){ return Map.of("status","ok"); }
}
