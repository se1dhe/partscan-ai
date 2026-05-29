package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class GeminiVisionService {
 private final RestClient restClient;
 private final ObjectMapper objectMapper;
 private final String apiKey;
 private final String model;

 public GeminiVisionService(
  RestClient.Builder restClientBuilder,
  ObjectMapper objectMapper,
  @Value("${gemini.api-key}") String apiKey,
  @Value("${gemini.model}") String model
 ) {
  this.restClient = restClientBuilder.baseUrl("https://generativelanguage.googleapis.com/v1beta").build();
  this.objectMapper = objectMapper;
  this.apiKey = apiKey;
  this.model = model;
 }

 public boolean isConfigured() {
  return StringUtils.hasText(apiKey);
 }

 public VisionAnalysisResult analyze(MultipartFile file) {
  if (!isConfigured()) {
   throw new IllegalStateException("GEMINI_API_KEY is not configured");
  }

  try {
   Map<String, Object> body = Map.of(
    "contents", List.of(Map.of(
     "role", "user",
     "parts", List.of(
      Map.of("text", prompt()),
      Map.of("inlineData", Map.of(
       "mimeType", contentType(file),
       "data", Base64.getEncoder().encodeToString(file.getBytes())
      ))
     )
    )),
    "generationConfig", Map.of(
     "responseMimeType", "application/json",
     "responseSchema", schema()
    )
   );

   String response = restClient.post()
    .uri("/models/{model}:generateContent", model)
    .contentType(MediaType.APPLICATION_JSON)
    .headers(headers -> headers.set("x-goog-api-key", apiKey))
    .body(body)
    .retrieve()
    .body(String.class);

   String json = extractText(response);
   PartAnalysisDto analysis = objectMapper.readValue(json, PartAnalysisDto.class);
   return new VisionAnalysisResult(analysis, response, "gemini");
  } catch (RestClientResponseException e) {
   throw GeminiVisionException.from(e, objectMapper);
  } catch (IOException e) {
   throw new IllegalStateException("Could not analyze uploaded image with Gemini", e);
  }
 }

 private String contentType(MultipartFile file) {
  return StringUtils.hasText(file.getContentType()) ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE;
 }

 private String extractText(String response) throws IOException {
  JsonNode root = objectMapper.readTree(response);
  JsonNode text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
  if (text.isTextual() && text.asText().trim().startsWith("{")) return text.asText();

  for (JsonNode textNode : root.findValues("text")) {
   if (textNode.isTextual() && textNode.asText().trim().startsWith("{")) return textNode.asText();
  }

  throw new IllegalStateException("Gemini response did not contain JSON analysis");
 }

 private String prompt() {
  return """
   You are helping catalog spare automotive parts from a workshop photo.
   Identify the part only from visible evidence, even when no part number or label is visible.
   If a field is uncertain, use a cautious value like "unknown"; articleNumber may be an empty string when no number is visible.
   Return compact Russian text where it helps the mechanic, but keep brand names and part numbers exactly as seen.
   Estimate confidence from 0 to 1. Compatible vehicles must be likely candidates, not guarantees.
   Prefer useful generic identification over refusing: for example "brake caliper", "engine mount", "ABS sensor", "air duct", "suspension arm".
   """;
 }

 private Map<String, Object> schema() {
  Map<String, Object> stringArray = Map.of("type", "ARRAY", "items", Map.of("type", "STRING"));
  return Map.of(
   "type", "OBJECT",
   "required", List.of("name", "manufacturer", "articleNumber", "category", "confidence", "description", "condition", "visibleMarkings", "compatibleVehicles", "sourceHints"),
   "properties", Map.of(
    "name", Map.of("type", "STRING"),
    "manufacturer", Map.of("type", "STRING"),
    "articleNumber", Map.of("type", "STRING"),
    "category", Map.of("type", "STRING"),
    "confidence", Map.of("type", "NUMBER"),
    "description", Map.of("type", "STRING"),
    "condition", Map.of("type", "STRING"),
    "visibleMarkings", stringArray,
    "compatibleVehicles", stringArray,
    "sourceHints", stringArray
   )
  );
 }
}
