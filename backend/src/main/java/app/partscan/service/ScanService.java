package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;
import app.partscan.dto.ScanResponse;
import app.partscan.entity.Part;
import app.partscan.repository.PartRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ScanService {
 private static final Logger log = LoggerFactory.getLogger(ScanService.class);

 private final OpenAiVisionService openAiVisionService;
 private final GeminiVisionService geminiVisionService;
 private final PartRepository partRepository;
 private final ObjectMapper objectMapper;

 public ScanService(OpenAiVisionService openAiVisionService, GeminiVisionService geminiVisionService, PartRepository partRepository, ObjectMapper objectMapper) {
  this.openAiVisionService = openAiVisionService;
  this.geminiVisionService = geminiVisionService;
  this.partRepository = partRepository;
  this.objectMapper = objectMapper;
 }

 public ScanResponse scan(MultipartFile file) {
  log.info("Scan started: fileName={}, contentType={}, size={} bytes", file.getOriginalFilename(), file.getContentType(), file.getSize());

  VisionAnalysisResult result = analyzeWithFallback(file);
  log.info("Scan analysis completed: provider={}", result.provider());

  Part part = toPart(result.analysis(), result.rawResponse());
  Part savedPart = partRepository.save(part);
  log.info("Scan result saved: partId={}, name={}, confidence={}", savedPart.getId(), savedPart.getName(), savedPart.getConfidence());

  return new ScanResponse("saved", savedPart);
 }

 private VisionAnalysisResult analyzeWithFallback(MultipartFile file) {
  try {
   log.info("Trying AI analysis with OpenAI");
   return openAiVisionService.analyze(file);
  } catch (OpenAiVisionException openAiError) {
   log.warn("OpenAI analysis failed: status={}, message={}", openAiError.getStatus(), openAiError.getMessage());
   return analyzeWithGeminiFallback(file, openAiError);
  } catch (IllegalStateException openAiError) {
   log.warn("OpenAI analysis is unavailable: message={}", openAiError.getMessage());
   return analyzeWithGeminiFallback(file, openAiError);
  }
 }

 private VisionAnalysisResult analyzeWithGeminiFallback(MultipartFile file, Exception openAiError) {
  if (!geminiVisionService.isConfigured()) {
   log.error("Gemini fallback is not configured. Original OpenAI error: {}", openAiError.getMessage());
   throw openAiError instanceof RuntimeException runtimeException ? runtimeException : new IllegalStateException(openAiError);
  }

  try {
   log.info("Trying AI analysis with Gemini fallback");
   return geminiVisionService.analyze(file);
  } catch (GeminiVisionException geminiError) {
   log.warn("Gemini fallback failed: status={}, message={}. Original OpenAI error: {}", geminiError.getStatus(), geminiError.getMessage(), openAiError.getMessage());
   throw geminiError;
  } catch (RuntimeException geminiError) {
   log.error("Gemini fallback failed with unexpected error. Original OpenAI error: {}", openAiError.getMessage(), geminiError);
   throw geminiError;
  }
 }

 private Part toPart(PartAnalysisDto analysis, String rawResponse) {
  Part part = new Part();
  part.setName(analysis.name());
  part.setManufacturer(analysis.manufacturer());
  part.setArticleNumber(analysis.articleNumber());
  part.setCategory(analysis.category());
  part.setConfidence(analysis.confidence());
  part.setDescription(analysis.description());
  part.setCondition(analysis.condition());
  part.setVisibleMarkings(toJson(analysis.visibleMarkings()));
  part.setCompatibleVehicles(toJson(analysis.compatibleVehicles()));
  part.setSourceHints(toJson(analysis.sourceHints()));
  part.setRawAnalysis(rawResponse);
  return part;
 }

 private String toJson(Object value) {
  try {
   return objectMapper.writeValueAsString(value);
  } catch (JsonProcessingException e) {
   throw new IllegalStateException("Could not serialize analysis value", e);
  }
 }
}
