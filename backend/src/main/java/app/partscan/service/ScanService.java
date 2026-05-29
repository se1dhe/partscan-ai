package app.partscan.service;
import app.partscan.dto.PartAnalysisDto;
import app.partscan.dto.ScanResponse;
import app.partscan.entity.Part;
import app.partscan.repository.PartRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
@Service
public class ScanService {
 private final OpenAiVisionService openAiVisionService;
 private final PartRepository partRepository;
 private final ObjectMapper objectMapper;

 public ScanService(OpenAiVisionService openAiVisionService, PartRepository partRepository, ObjectMapper objectMapper) {
  this.openAiVisionService = openAiVisionService;
  this.partRepository = partRepository;
  this.objectMapper = objectMapper;
 }

 public ScanResponse scan(MultipartFile file) {
  OpenAiVisionService.AnalysisResult result = openAiVisionService.analyze(file);
  Part part = toPart(result.analysis(), result.rawResponse());
  return new ScanResponse("saved", partRepository.save(part));
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
