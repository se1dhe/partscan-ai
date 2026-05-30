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
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class OpenAiVisionService {
 private final RestClient restClient;
 private final ObjectMapper objectMapper;
 private final String apiKey;
 private final String model;

 public OpenAiVisionService(RestClient.Builder restClientBuilder, ObjectMapper objectMapper, @Value("${openai.api-key}") String apiKey, @Value("${openai.model}") String model) {
  this.restClient = restClientBuilder.baseUrl("https://api.openai.com/v1").build();
  this.objectMapper = objectMapper;
  this.apiKey = apiKey;
  this.model = model;
 }

 public boolean isConfigured() { return StringUtils.hasText(apiKey); }
 public VisionAnalysisResult analyze(MultipartFile file) { return analyze(List.of(file)); }

 public VisionAnalysisResult analyze(List<MultipartFile> files) {
  if (!isConfigured()) throw new IllegalStateException("OPENAI_API_KEY is not configured");
  try {
   List<Object> content = new ArrayList<>();
   content.add(Map.of("type", "input_text", "text", prompt(files.size())));
   int index = 1;
   for (MultipartFile file : files) {
    content.add(Map.of("type", "input_text", "text", "Image " + index + " of " + files.size() + ": analyze this angle as additional evidence."));
    content.add(Map.of("type", "input_image", "image_url", toDataUrl(file)));
    index++;
   }

   Map<String, Object> body = Map.of("model", model, "input", List.of(Map.of("role", "user", "content", content)), "text", Map.of("format", schema()));
   String response = restClient.post().uri("/responses").contentType(MediaType.APPLICATION_JSON).headers(headers -> headers.setBearerAuth(apiKey)).body(body).retrieve().body(String.class);
   String json = extractOutputText(response);
   PartAnalysisDto analysis = objectMapper.readValue(json, PartAnalysisDto.class);
   return new VisionAnalysisResult(analysis, response, "openai");
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
  for (JsonNode textNode : root.findValues("text")) if (textNode.isTextual() && textNode.asText().trim().startsWith("{")) return textNode.asText();
  throw new IllegalStateException("OpenAI response did not contain JSON analysis");
 }

 private String prompt(int imageCount) {
  return """
   You are a careful automotive spare parts catalog expert for a workshop and dismantling yard.
   First decide whether the image contains an automotive spare part, a vehicle component, or a part still installed in a car.
   If the image mostly contains unrelated objects, furniture, hands, keyboard, screen, floor, room, packaging without visible part, or a random non-car object, return automotivePart=false, confidence=0, needsBetterPhoto=true, empty vehicle lists, and do not invent a part.
   If automotivePart=false, name must be "Не автодеталь", normalizedName must be "not_part", category must be "not_part", and identificationReason must explain in Russian why it is not saved.
   You may receive one image or multiple images of the same part from different camera angles. Treat all images as the same physical part or installed vehicle node.
   Analyze only visible evidence. Do not invent article numbers, brands, vehicle models, or exact fitment.
   Return Russian text for mechanic-facing fields, but preserve brand names, numbers, codes, and markings exactly as visible.
   confidence must reflect visible evidence, not guesswork. Use below 0.9 unless markings, shape, ports, and context strongly agree.
   needsBetterPhoto must be true when another camera angle, closer marking photo, or better light is required.
   Never ask the user to flip, remove, rotate, or disassemble the part. This is an auto dismantling / installed-car workflow: engines, gearboxes, ABS blocks, bumpers, modules, and harnesses may be mounted and heavy.
   For imageCount=%d, if automotivePart=true and confidence is below 0.9, photoTips must ask for practical camera movement only: move camera left/right, shoot from above, shoot from lower angle, close-up of marking, close-up of connector/ports, close-up of mounting points, add light.
   identificationReason must explain the key visual clues in one concise Russian sentence.
   alternatives must include up to 3 plausible alternative identifications when confidence is below 0.9 or the part may be confused with another part.
   """.formatted(imageCount);
 }

 private Map<String, Object> schema() {
  Map<String, Object> stringArray = Map.of("type", "array", "items", Map.of("type", "string"));
  Map<String, Object> alternative = Map.of("type", "object", "additionalProperties", false, "required", List.of("name", "confidence", "reason"), "properties", Map.of("name", Map.of("type", "string"), "confidence", Map.of("type", "number", "minimum", 0, "maximum", 1), "reason", Map.of("type", "string")));
  return Map.of("type", "json_schema", "name", "part_analysis", "strict", true, "schema", Map.of("type", "object", "additionalProperties", false, "required", List.of("automotivePart", "name", "normalizedName", "manufacturer", "articleNumber", "category", "confidence", "description", "condition", "needsBetterPhoto", "identificationReason", "visibleMarkings", "compatibleVehicles", "sourceHints", "photoTips", "alternatives"), "properties", Map.ofEntries(
   Map.entry("automotivePart", Map.of("type", "boolean")), Map.entry("name", Map.of("type", "string")), Map.entry("normalizedName", Map.of("type", "string")), Map.entry("manufacturer", Map.of("type", "string")), Map.entry("articleNumber", Map.of("type", "string")), Map.entry("category", Map.of("type", "string")), Map.entry("confidence", Map.of("type", "number", "minimum", 0, "maximum", 1)), Map.entry("description", Map.of("type", "string")), Map.entry("condition", Map.of("type", "string")), Map.entry("needsBetterPhoto", Map.of("type", "boolean")), Map.entry("identificationReason", Map.of("type", "string")), Map.entry("visibleMarkings", stringArray), Map.entry("compatibleVehicles", stringArray), Map.entry("sourceHints", stringArray), Map.entry("photoTips", stringArray), Map.entry("alternatives", Map.of("type", "array", "items", alternative)))));
 }
}