package app.partscan.controller;

import app.partscan.dto.PartFeedbackRequest;
import app.partscan.entity.Part;
import app.partscan.entity.PartFeedback;
import app.partscan.repository.PartFeedbackRepository;
import app.partscan.repository.PartRepository;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/parts")
public class PartController {
 private final PartRepository partRepository;
 private final PartFeedbackRepository feedbackRepository;

 public PartController(PartRepository partRepository, PartFeedbackRepository feedbackRepository) {
  this.partRepository = partRepository;
  this.feedbackRepository = feedbackRepository;
 }

 @GetMapping
 public List<Part> list() {
  return partRepository.findTop50ByOrderByCreatedAtDesc();
 }

 @PostMapping("/{id}/review")
 @ResponseStatus(HttpStatus.NO_CONTENT)
 public void review(@PathVariable UUID id, @RequestBody PartFeedbackRequest request) {
  Part part = partRepository.findById(id)
   .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Part not found"));

  PartFeedback entry = new PartFeedback();
  entry.setPart(part);
  entry.setIsCorrect(request.isCorrect());
  entry.setSuggestedName(request.correctedName());
  entry.setSuggestedManufacturer(request.correctedManufacturer());
  entry.setSuggestedArticleNumber(request.correctedArticleNumber());
  entry.setSuggestedCategory(request.correctedCategory());
  entry.setNote(request.note());
  feedbackRepository.save(entry);

  if (Boolean.TRUE.equals(request.isCorrect())) {
   part.setReviewStatus("confirmed");
  } else {
   part.setReviewStatus("corrected");
   if (StringUtils.hasText(request.correctedName())) part.setName(request.correctedName());
   if (StringUtils.hasText(request.correctedManufacturer())) part.setManufacturer(request.correctedManufacturer());
   if (StringUtils.hasText(request.correctedArticleNumber())) part.setArticleNumber(request.correctedArticleNumber());
   if (StringUtils.hasText(request.correctedCategory())) part.setCategory(request.correctedCategory());
  }

  partRepository.save(part);
 }
}
