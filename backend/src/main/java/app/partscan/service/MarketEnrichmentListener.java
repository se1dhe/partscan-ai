package app.partscan.service;

import app.partscan.entity.Part;
import app.partscan.repository.PartRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MarketEnrichmentListener {
 private static final Logger log = LoggerFactory.getLogger(MarketEnrichmentListener.class);
 private final PartRepository partRepository;
 private final OlxSearchService olxSearchService;

 public MarketEnrichmentListener(PartRepository partRepository, OlxSearchService olxSearchService) {
  this.partRepository = partRepository;
  this.olxSearchService = olxSearchService;
 }

 @Async
 @TransactionalEventListener(fallbackExecution = true)
 public void handle(SavedPartEvent event) {
  try {
   Part part = partRepository.findById(event.partId()).orElse(null);
   if (part != null) olxSearchService.refreshListings(part);
  } catch (Exception error) {
   log.warn("Market task failed: partId={}, message={}", event.partId(), error.getMessage());
  }
 }
}
