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
public class OpenAiVisionService {
 private final RestClient restClient;
 private final ObjectMapper objectMapper;
 private final String apiKey;
 private final String model;

 public OpenAiVisionService(
  RestClient.Builder restClientBuilder,
  ObjectMapper objectMapper,
  @Value("${openai.api-key}") String apiKey,
  @Value("${openai.model}") String model
 ) {
  this.restClient = restClientBuilder.baseUrl("https://api.openai.com/v1").build();
  this.objectMapper = objectMapper;
  this.apiKey = apiKey;
  this.model = model;
 }

 public AnalysisResult analyze(MultipartFile file) {
  if (!StringUtils.hasText(apiKey)) {
   throw new IllegalStateException("OPENAI_API_KEY is not configured");
  }

  try {
   String dataUrl = toDataUrl(file);
   Map<String, Object> body = Map.of(
    "model", model,
    "input", List.of(Map.of(
     "role", "user",
     "content", List.of(
      Map.of("type", "input_text", "text", prompt()),
      Map.of("type", "input_image", "image_url", dataUrl)
     )
    )),
    "text", Map.of("format", schema())
   );

   String response = restClient.post()
    .uri("/responses")
    .contentType(MediaType.APPLICATION_JSON)
    .headers(headers -> headers.setBearerAuth(apiKey))
    .body(body)
    .retrieve()
    .body(String.class);

   String json = extractOutputText(response);
   PartAnalysisDto analysis = objectMapper.readValue(json, PartAnalysisDto.class);
   return new AnalysisResult(analysis, response);
  } catch (RestClientResponseException e) {
   throw OpenAiVisionException.from(e, objectMapper);
  } catch (IOException e) {
   throw new IllegalStateException("Could not analyze uploaded image", e);
  }
 }

 private String toDataUrl(MultipartFile file) throws IOException {
  String contentType = StringUtils.hasText(file.getContentType()) ? file.getContentType() : MediaType.IMAGE_JPEG_VALUE;
  return "data:" + contentType + ";base64," + Base64.getEncoder().encodeToString(file.getBytes());
 }

 private String extractOutputText(String response) throws IOException {
  JsonNode root = objectMapper.readTree(response);
  JsonNode outputText = root.findValue("output_text");
  if (outputText != null && outputText.has("text")) return outputText.get("text").asText();

  for (JsonNode textNode : root.findValues("text")) {
   if (textNode.isTextual() && textNode.asText().trim().startsWith("{")) return textNode.asText();
  }

  throw new IllegalStateException("OpenAI response did not contain JSON analysis");
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
  Map<String, Object> stringArray = Map.of("type", "array", "items", Map.of("type", "string"));
  return Map.of(
   "type", "json_schema",
   "name", "part_analysis",
   "strict", true,
   "schema", Map.of(
    "type", "object",
    "additionalProperties", false,
    "required", List.of("name", "manufacturer", "articleNumber", "category", "confidence", "description", "condition", "visibleMarkings", "compatibleVehicles", "sourceHints"),
    "properties", Map.of(
     "name", Map.of("type", "string"),
     "manufacturer", Map.of("type", "string"),
     "articleNumber", Map.of("type", "string"),
     "category", Map.of("type", "string"),
     "confidence", Map.of("type", "number", "minimum", 0, "maximum", 1),
     "description", Map.of("type", "string"),
     "condition", Map.of("type", "string"),
     "visibleMarkings", stringArray,
     "compatibleVehicles", stringArray,
     "sourceHints", stringArray
    )
   )
  );
 }

 public record AnalysisResult(PartAnalysisDto analysis, String rawResponse) {}
}
