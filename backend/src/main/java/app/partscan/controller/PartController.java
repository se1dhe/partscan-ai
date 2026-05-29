package app.partscan.controller;
import app.partscan.entity.Part;
import app.partscan.repository.PartRepository;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController
@RequestMapping("/api/v1/parts")
public class PartController {
 private final PartRepository partRepository;

 public PartController(PartRepository partRepository) {
  this.partRepository = partRepository;
 }

 @GetMapping
 public List<Part> list() {
  return partRepository.findTop50ByOrderByCreatedAtDesc();
 }
}
