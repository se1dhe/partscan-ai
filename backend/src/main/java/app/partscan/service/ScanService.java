package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;
import app.partscan.dto.ScanResponse;
import app.partscan.entity.Part;
import app.partscan.repository.PartRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.List;

@Service
public class ScanService {
 private static final Logger log = LoggerFactory.getLogger(ScanService.class);
 private static final double FINAL_CONFIDENCE_THRESHOLD = 0.9;
 private static final long MAX_STORED_IMAGE_BYTES = 650_000;

 private final OpenAiVisionService openAiVisionService;
 private final GeminiVisionService geminiVisionService;
 private final PartRepository partRepository;
 private final ObjectMapper objectMapper;
 private final ApplicationEventPublisher events;

 public ScanService(OpenAiVisionService openAiVisionService, GeminiVisionService geminiVisionService, PartRepository partRepository, ObjectMapper objectMapper, ApplicationEventPublisher events) {
  this.openAiVisionService = openAiVisionService;
  this.geminiVisionService = geminiVisionService;
  this.partRepository = partRepository;
  this.objectMapper = objectMapper;
  this.events = events;
 }

 public ScanResponse scan(MultipartFile file) { return scan(List.of(file)); }

 public ScanResponse scan(List<MultipartFile> files) {
  log.info("Scan started: images={}, totalSize={} bytes", files.size(), totalSize(files));

  VisionAnalysisResult result = analyzeWithFallback(files);
  PartAnalysisDto analysis = result.analysis();
  double confidence = clampConfidence(analysis.confidence());
  boolean confidentEnough = confidence >= FINAL_CONFIDENCE_THRESHOLD && !Boolean.TRUE.equals(analysis.needsBetterPhoto());
  log.info("Scan analysis completed: provider={}, images={}, automotivePart={}, confidence={}, confidentEnough={}, scope={}", result.provider(), files.size(), analysis.automotivePart(), confidence, confidentEnough, analysis.partScope());

  if (!Boolean.TRUE.equals(analysis.automotivePart())) {
   log.info("Scan rejected as non automotive part: name={}, reason={}", analysis.name(), analysis.identificationReason());
   return ScanResponse.rejected(defaultText(analysis.identificationReason(), "В кадре не похожая на автодеталь вещь. В базу не сохраняю."), firstTip(analysis.photoTips()));
  }

  Part part = toPart(analysis, result.rawResponse());
  part.setImageUrl(toDataUrl(files.get(0)));

  if (!confidentEnough) {
   log.info("Scan needs angle before final save: name={}, confidence={}, images={}", part.getName(), part.getConfidence(), files.size());
   return ScanResponse.needsAngle(part, "Найдено предварительно, но для сохранения нужна точность выше 90%.", firstTip(analysis.photoTips()));
  }

  Part savedPart = partRepository.save(part);
  log.info("Scan result saved: partId={}, name={}, confidence={}, reviewStatus={}, scope={}", savedPart.getId(), savedPart.getName(), savedPart.getConfidence(), savedPart.getReviewStatus(), savedPart.getPartScope());
  events.publishEvent(new SavedPartEvent(savedPart.getId()));
  return ScanResponse.saved(savedPart);
 }

 private VisionAnalysisResult analyzeWithFallback(List<MultipartFile> files) {
  if (!openAiVisionService.isConfigured()) {
   log.info("OpenAI is not configured. Using Gemini directly");
   return analyzeWithGemini(files);
  }

  try {
   log.info("Trying AI analysis with OpenAI");
   return openAiVisionService.analyze(files);
  } catch (OpenAiVisionException openAiError) {
   log.warn("OpenAI analysis failed: status={}, message={}", openAiError.getStatus(), openAiError.getMessage());
   return analyzeWithGeminiFallback(files, openAiError);
  } catch (IllegalStateException openAiError) {
   log.warn("OpenAI analysis is unavailable: message={}", openAiError.getMessage());
   return analyzeWithGeminiFallback(files, openAiError);
  }
 }

 private VisionAnalysisResult analyzeWithGemini(List<MultipartFile> files) {
  if (!geminiVisionService.isConfigured()) throw new IllegalStateException("No AI provider is configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
  log.info("Trying AI analysis with Gemini");
  return geminiVisionService.analyze(files);
 }

 private VisionAnalysisResult analyzeWithGeminiFallback(List<MultipartFile> files, Exception openAiError) {
  if (!geminiVisionService.isConfigured()) {
   log.error("Gemini fallback is not configured. Original error: {}", openAiError.getMessage());
   throw openAiError instanceof RuntimeException runtimeException ? runtimeException : new IllegalStateException(openAiError);
  }
  try {
   log.info("Trying AI analysis with Gemini fallback");
   return geminiVisionService.analyze(files);
  } catch (GeminiVisionException geminiError) {
   log.warn("Gemini fallback failed: status={}, message={}. Original error: {}", geminiError.getStatus(), geminiError.getMessage(), openAiError.getMessage());
   throw geminiError;
  } catch (RuntimeException geminiError) {
   log.error("Gemini fallback failed with unexpected error. Original error: {}", openAiError.getMessage(), geminiError);
   throw geminiError;
  }
 }

 private long totalSize(List<MultipartFile> files) { return files.stream().mapToLong(MultipartFile::getSize).sum(); }

 private Part toPart(PartAnalysisDto analysis, String rawResponse) {
  Part part = new Part();
  part.setName(defaultText(analysis.name(), "Неизвестная деталь"));
  part.setNormalizedName(defaultText(analysis.normalizedName(), analysis.name()));
  part.setManufacturer(defaultText(analysis.manufacturer(), "unknown"));
  part.setArticleNumber(defaultText(analysis.articleNumber(), ""));
  part.setCategory(defaultText(analysis.category(), "unknown"));
  part.setConfidence(clampConfidence(analysis.confidence()));
  part.setDescription(defaultText(analysis.description(), ""));
  part.setCondition(defaultText(analysis.condition(), "unknown"));
  part.setNeedsBetterPhoto(Boolean.TRUE.equals(analysis.needsBetterPhoto()));
  part.setPartScope(defaultText(analysis.partScope(), "unknown"));
  part.setVisibleComponentName(defaultText(analysis.visibleComponentName(), ""));
  part.setAssemblyName(defaultText(analysis.assemblyName(), ""));
  part.setUncertaintyNote(defaultText(analysis.uncertaintyNote(), ""));
  part.setSearchQueries(toJson(analysis.searchQueries()));
  part.setIdentificationReason(defaultText(analysis.identificationReason(), ""));
  part.setVisibleMarkings(toJson(analysis.visibleMarkings()));
  part.setCompatibleVehicles(toJson(analysis.compatibleVehicles()));
  part.setSourceHints(toJson(analysis.sourceHints()));
  part.setPhotoTips(toJson(analysis.photoTips()));
  part.setAlternatives(toJson(analysis.alternatives()));
  part.setRawAnalysis(rawResponse);
  part.setReviewStatus(reviewStatus(analysis));
  return part;
 }

 private String toDataUrl(MultipartFile file) {
  if (file == null || file.isEmpty() || file.getSize() > MAX_STORED_IMAGE_BYTES) return null;
  try {
   String contentType = defaultText(file.getContentType(), "image/jpeg");
   return "data:" + contentType + ";base64," + Base64.getEncoder().encodeToString(file.getBytes());
  } catch (IOException error) {
   log.warn("Could not store scan photo: message={}", error.getMessage());
   return null;
  }
 }

 private String reviewStatus(PartAnalysisDto analysis) {
  Double confidence = analysis.confidence();
  if (Boolean.TRUE.equals(analysis.needsBetterPhoto())) return "needs_photo";
  if (confidence == null || confidence < FINAL_CONFIDENCE_THRESHOLD) return "needs_review";
  return "pending";
 }

 private Double clampConfidence(Double value) {
  if (value == null) return 0.0;
  if (value < 0) return 0.0;
  if (value > 1) return 1.0;
  return value;
 }

 private String defaultText(String value, String fallback) { return value == null || value.isBlank() ? fallback : value; }
 private String firstTip(List<String> tips) { return tips == null || tips.isEmpty() ? "Наведите камеру на автодеталь целиком." : tips.get(0); }

 private String toJson(Object value) {
  try { return objectMapper.writeValueAsString(value == null ? java.util.List.of() : value); }
  catch (JsonProcessingException e) { throw new IllegalStateException("Could not serialize analysis value", e); }
 }
}
