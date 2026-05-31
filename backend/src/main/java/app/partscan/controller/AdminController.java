package app.partscan.controller;

import app.partscan.repository.PartFeedbackRepository;
import app.partscan.repository.PartMarketListingRepository;
import app.partscan.repository.PartRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
 private final String adminToken;
 private final PartRepository partRepository;
 private final PartFeedbackRepository feedbackRepository;
 private final PartMarketListingRepository listingRepository;

 public AdminController(@Value("${admin.token}") String adminToken, PartRepository partRepository, PartFeedbackRepository feedbackRepository, PartMarketListingRepository listingRepository) {
  this.adminToken = adminToken;
  this.partRepository = partRepository;
  this.feedbackRepository = feedbackRepository;
  this.listingRepository = listingRepository;
 }

 @PostMapping("/database/reset")
 @ResponseStatus(HttpStatus.NO_CONTENT)
 @Transactional
 public void reset(@RequestHeader(name = "X-Admin-Token", required = false) String token) {
  if (!StringUtils.hasText(adminToken) || !adminToken.equals(token)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid admin token");
  listingRepository.deleteAllInBatch();
  feedbackRepository.deleteAllInBatch();
  partRepository.deleteAllInBatch();
 }
}
