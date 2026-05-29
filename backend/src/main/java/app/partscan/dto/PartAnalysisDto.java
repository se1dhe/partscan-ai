package app.partscan.dto;
import java.util.List;
public record PartAnalysisDto(
 String name,
 String manufacturer,
 String articleNumber,
 String category,
 Double confidence,
 String description,
 String condition,
 List<String> visibleMarkings,
 List<String> compatibleVehicles,
 List<String> sourceHints
){}
