package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.LinkedHashMap;
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
   String json = extractJson(response);
   PartAnalysisDto analysis = parseAnalysis(json);
   return new VisionAnalysisResult(analysis, response, "gemini");
  } catch (Exception e) {
   log.warn("Gemini parse failed: reason={}, raw={}", e.getMessage(), compact(response));
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

  Map<String, Object> generationConfig = new LinkedHashMap<>();
  generationConfig.put("responseMimeType", "application/json");
  generationConfig.put("temperature", 0);
  generationConfig.put("maxOutputTokens", 2048);

  if (model != null && model.startsWith("gemini-2.5")) {
   generationConfig.put("thinkingConfig", Map.of("thinkingBudget", 0));
  }

  return Map.of(
   "contents", List.of(Map.of("role", "user", "parts", parts)),
   "generationConfig", generationConfig
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

 private PartAnalysisDto parseAnalysis(String json) throws IOException {
  JsonNode parsed = objectMapper.readTree(json);
  ObjectNode normalized = objectMapper.createObjectNode();
  normalized.put("automotivePart", parsed.path("automotivePart").asBoolean(parsed.path("isAutomotivePart").asBoolean(true)));
  normalized.put("name", text(parsed, "name", "Неизвестная деталь"));
  normalized.put("normalizedName", text(parsed, "normalizedName", text(parsed, "name", "unknown")));
  normalized.put("manufacturer", text(parsed, "manufacturer", "unknown"));
  normalized.put("articleNumber", text(parsed, "articleNumber", ""));
  normalized.put("category", text(parsed, "category", "unknown"));
  normalized.put("confidence", number(parsed, "confidence", 0.0));
  normalized.put("description", text(parsed, "description", ""));
  normalized.put("condition", text(parsed, "condition", "unknown"));
  normalized.put("needsBetterPhoto", parsed.path("needsBetterPhoto").asBoolean(false));
  normalized.put("partScope", normalizeScope(text(parsed, "partScope", text(parsed, "scope", "unknown"))));
  normalized.put("visibleComponentName", text(parsed, "visibleComponentName", text(parsed, "componentName", "")));
  normalized.put("assemblyName", text(parsed, "assemblyName", text(parsed, "systemName", "")));
  normalized.put("uncertaintyNote", text(parsed, "uncertaintyNote", ""));
  normalized.put("identificationReason", text(parsed, "identificationReason", text(parsed, "reason", "")));
  normalized.set("searchQueries", stringArray(parsed.get("searchQueries")));
  normalized.set("visibleMarkings", stringArray(parsed.get("visibleMarkings")));
  normalized.set("compatibleVehicles", stringArray(parsed.get("compatibleVehicles")));
  normalized.set("sourceHints", stringArray(parsed.get("sourceHints")));
  normalized.set("photoTips", stringArray(parsed.get("photoTips")));
  normalized.set("alternatives", alternativesArray(parsed.get("alternatives")));
  return objectMapper.treeToValue(normalized, PartAnalysisDto.class);
 }

 private String extractJson(String response) throws IOException {
  JsonNode root = objectMapper.readTree(response);
  JsonNode text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
  if (text.isTextual()) return cleanupJson(text.asText());
  for (JsonNode textNode : root.findValues("text")) if (textNode.isTextual()) return cleanupJson(textNode.asText());
  throw new IllegalStateException("Gemini response did not contain text JSON analysis");
 }

 private String cleanupJson(String value) {
  String text = value == null ? "" : value.trim();
  if (text.startsWith("```")) text = text.replaceFirst("^```(?:json)?", "").replaceFirst("```$", "").trim();
  int start = text.indexOf('{');
  int end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.substring(start, end + 1);
  throw new IllegalStateException("Gemini response text is not JSON");
 }

 private String text(JsonNode node, String field, String fallback) {
  JsonNode value = node == null ? null : node.get(field);
  if (value == null || value.isNull()) return fallback;
  return value.isTextual() ? value.asText(fallback) : value.toString();
 }

 private double number(JsonNode node, String field, double fallback) {
  JsonNode value = node == null ? null : node.get(field);
  if (value == null || value.isNull()) return fallback;
  if (value.isNumber()) return value.asDouble(fallback);
  if (value.isTextual()) {
   String raw = value.asText().trim();
   try { return Double.parseDouble(raw.replace("%", "")) / (raw.contains("%") ? 100.0 : 1.0); } catch (NumberFormatException ignored) { return fallback; }
  }
  return fallback;
 }

 private ArrayNode stringArray(JsonNode value) {
  ArrayNode array = objectMapper.createArrayNode();
  if (value == null || value.isNull()) return array;
  if (value.isArray()) {
   for (JsonNode item : value) if (!item.isNull()) array.add(item.isTextual() ? item.asText() : item.toString());
   return array;
  }
  if (value.isTextual() && StringUtils.hasText(value.asText())) array.add(value.asText());
  return array;
 }

 private ArrayNode alternativesArray(JsonNode value) {
  ArrayNode array = objectMapper.createArrayNode();
  if (value == null || !value.isArray()) return array;
  for (JsonNode item : value) {
   ObjectNode alternative = objectMapper.createObjectNode();
   alternative.put("name", text(item, "name", "Альтернатива"));
   alternative.put("confidence", number(item, "confidence", 0.0));
   alternative.put("reason", text(item, "reason", ""));
   array.add(alternative);
  }
  return array;
 }

 private String normalizeScope(String value) {
  if (!StringUtils.hasText(value)) return "unknown";
  String normalized = value.trim().toLowerCase();
  return switch (normalized) {
   case "whole_part", "assembly", "subcomponent", "fragment", "installed_component", "unknown" -> normalized;
   default -> "unknown";
  };
 }

 private String compact(String response) {
  String value = response == null ? "" : response.replaceAll("\\s+", " ").trim();
  return value.length() > 1200 ? value.substring(0, 1200) + "..." : value;
 }

 private String prompt(int imageCount) {
  return """
   Identify an automotive spare part or installed vehicle component from %d image(s).
   Return only valid compact JSON with fields: automotivePart, name, normalizedName, manufacturer, articleNumber, category, confidence, description, condition, needsBetterPhoto, partScope, visibleComponentName, assemblyName, uncertaintyNote, searchQueries, identificationReason, visibleMarkings, compatibleVehicles, sourceHints, photoTips, alternatives.
   Russian text. Preserve visible brands and numbers exactly.
   partScope must be one of: whole_part, assembly, subcomponent, fragment, installed_component, unknown.
   First decide whether the image shows a whole sellable part, a larger assembly, a subcomponent, a fragment, or a component still installed in a vehicle.
   If only a part of a larger EGR/intake/brake/engine assembly is visible, do not call it the whole assembly. Put the visible item into visibleComponentName and the larger unit into assemblyName.
   For VAG diesel EGR/intake parts with a round butterfly flap, prefer names like "Дроссельная заслонка / заслонка EGR" instead of only "Клапан EGR" unless the full EGR valve is clearly visible.
   name must be the best short sellable name for a database card, not only the broad vehicle system.
   searchQueries must contain 4-7 short OLX search queries. Put exact part number without spaces first, then part number with spaces, then number + visible component name, then alternative names.
   If not an automotive part: automotivePart=false, name="Не автодеталь", normalizedName="not_part", category="not_part", confidence=0, needsBetterPhoto=true, partScope="unknown".
   Do not invent part numbers, brands, vehicle fitment, or condition. Use unknown or empty arrays when not visible.
   confidence must be a number from 0 to 1. Use 0.9 or higher only when visual evidence and marking are strong.
   If the visible item may be only a component of a larger unit, add a short uncertaintyNote.
   If more info is needed, suggest moving the camera closer or to the side, not flipping heavy installed parts.
   Keep all text fields very short.
   """.formatted(imageCount);
 }
}
