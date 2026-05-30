package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class GeminiVisionService {
 private static final Logger log = LoggerFactory.getLogger(GeminiVisionService.class);
 private static final int MAX_ATTEMPTS = 2;

 private final RestClient restClient;
 private final ObjectMapper objectMapper;
 private final String apiKey;
 private final String model;

 public GeminiVisionService(RestClient.Builder restClientBuilder, ObjectMapper objectMapper, @Value("${gemini.api-key}") String apiKey, @Value("${gemini.model}") String model) {
  this.restClient = restClientBuilder.baseUrl("https://generativelanguage.googleapis.com/v1beta").build();
  this.objectMapper = objectMapper;
  this.apiKey = apiKey;
  this.model = model;
 }

 public boolean isConfigured() { return StringUtils.hasText(apiKey); }
 public VisionAnalysisResult analyze(MultipartFile file) { return analyze(List.of(file)); }

 public VisionAnalysisResult analyze(List<MultipartFile> files) {
  if (!isConfigured()) throw new IllegalStateException("GEMINI_API_KEY is not configured");
  Map<String, Object> body;
  try { body = requestBody(files); } catch (IOException e) { throw new IllegalStateException("Could not read uploaded image for Gemini", e); }
  String response = executeWithRetry(body);
  try {
   String json = extractText(response);
   PartAnalysisDto analysis = objectMapper.readValue(json, PartAnalysisDto.class);
   return new VisionAnalysisResult(analysis, response, "gemini");
  } catch (IOException e) {
   throw new IllegalStateException("Could not analyze uploaded image with Gemini", e);
  }
 }

 private Map<String, Object> requestBody(List<MultipartFile> files) throws IOException {
  List<Object> parts = new ArrayList<>();
  parts.add(Map.of("text", prompt(files.size())));
  int index = 1;
  for (MultipartFile file : files) {
   parts.add(Map.of("text", "image " + index));
   parts.add(Map.of("inlineData", Map.of("mimeType", contentType(file), "data", Base64.getEncoder().encodeToString(file.getBytes()))));
   index++;
  }
  return Map.of(
   "contents", List.of(Map.of("role", "user", "parts", parts)),
   "generationConfig", Map.of(
    "responseMimeType", "application/json",
    "responseSchema", schema(),
    "temperature", 0,
    "maxOutputTokens", 650
   )
  );
 }

 private String executeWithRetry(Map<String, Object> body) {
  GeminiVisionException lastException = null;
  for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
   try {
    if (attempt > 1) log.info("Retrying Gemini analysis: attempt={}/{}", attempt, MAX_ATTEMPTS);
    return restClient.post().uri("/models/{model}:generateContent", model).contentType(MediaType.APPLICATION_JSON).headers(headers -> headers.set("x-goog-api-key", apiKey)).body(body).retrieve().body(String.class);
   } catch (RestClientResponseException e) {
    GeminiVisionException currentException = GeminiVisionException.from(e, objectMapper);
    lastException = currentException;
    if (!shouldRetry(e) || attempt == MAX_ATTEMPTS) throw currentException;
    sleepBeforeRetry(attempt);
   }
  }
  throw lastException == null ? new IllegalStateException("Gemini request failed") : lastException;
 }

 private boolean shouldRetry(RestClientResponseException exception) {
  HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
  return status == HttpStatus.SERVICE_UNAVAILABLE || status == HttpStatus.TOO_MANY_REQUESTS || status == HttpStatus.BAD_GATEWAY || status == HttpStatus.GATEWAY_TIMEOUT;
 }

 private void sleepBeforeRetry(int attempt) {
  long delayMillis = attempt == 1 ? 1200 : 2800;
  try { Thread.sleep(delayMillis); } catch (InterruptedException interruptedException) { Thread.currentThread().interrupt(); throw new IllegalStateException("Gemini retry was interrupted", interruptedException); }
 }

 private String contentType(MultipartFile file) { return StringUtils.hasText(file.getContentType()) ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE; }

 private String extractText(String response) throws IOException {
  JsonNode root = objectMapper.readTree(response);
  JsonNode text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
  if (text.isTextual() && text.asText().trim().startsWith("{")) return text.asText();
  for (JsonNode textNode : root.findValues("text")) if (textNode.isTextual() && textNode.asText().trim().startsWith("{")) return textNode.asText();
  throw new IllegalStateException("Gemini response did not contain JSON analysis");
 }

 private String prompt(int imageCount) {
  return """
   Identify an automotive spare part or installed vehicle component from %d image(s). Return ONLY compact JSON matching schema.
   Russian fields. Preserve visible brands/numbers exactly.
   If not an automotive part: automotivePart=false, name=\"Не автодеталь\", normalizedName=\"not_part\", category=\"not_part\", confidence=0, needsBetterPhoto=true.
   Do not invent part numbers, brands, vehicle fitment, or condition. Use unknown/empty arrays when not visible.
   confidence>=0.9 only when visual evidence is strong. needsBetterPhoto=true if a closer marking, connector, port, mounting point, side angle, or better light is needed.
   Never ask to flip/remove/disassemble the part; suggest only moving the camera.
   Keep description, identificationReason, photoTips, sourceHints, and alternatives very short.
   """.formatted(imageCount);
 }

 private Map<String, Object> schema() {
  Map<String, Object> stringArray = Map.of("type", "ARRAY", "items", Map.of("type", "STRING"));
  Map<String, Object> alternative = Map.of("type", "OBJECT", "required", List.of("name", "confidence", "reason"), "properties", Map.of("name", Map.of("type", "STRING"), "confidence", Map.of("type", "NUMBER"), "reason", Map.of("type", "STRING")));
  return Map.of("type", "OBJECT", "required", List.of("automotivePart", "name", "normalizedName", "manufacturer", "articleNumber", "category", "confidence", "description", "condition", "needsBetterPhoto", "identificationReason", "visibleMarkings", "compatibleVehicles", "sourceHints", "photoTips", "alternatives"), "properties", Map.ofEntries(
   Map.entry("automotivePart", Map.of("type", "BOOLEAN")), Map.entry("name", Map.of("type", "STRING")), Map.entry("normalizedName", Map.of("type", "STRING")), Map.entry("manufacturer", Map.of("type", "STRING")), Map.entry("articleNumber", Map.of("type", "STRING")), Map.entry("category", Map.of("type", "STRING")), Map.entry("confidence", Map.of("type", "NUMBER")), Map.entry("description", Map.of("type", "STRING")), Map.entry("condition", Map.of("type", "STRING")), Map.entry("needsBetterPhoto", Map.of("type", "BOOLEAN")), Map.entry("identificationReason", Map.of("type", "STRING")), Map.entry("visibleMarkings", stringArray), Map.entry("compatibleVehicles", stringArray), Map.entry("sourceHints", stringArray), Map.entry("photoTips", stringArray), Map.entry("alternatives", Map.of("type", "ARRAY", "items", alternative))));
 }
}
