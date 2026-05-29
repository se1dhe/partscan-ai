package app.partscan.dto;

import java.util.List;

public record PartAnalysisDto(
 String name,
 String normalizedName,
 String manufacturer,
 String articleNumber,
 String category,
 Double confidence,
 String description,
 String condition,
 Boolean needsBetterPhoto,
 String identificationReason,
 List<String> visibleMarkings,
 List<String> compatibleVehicles,
 List<String> sourceHints,
 List<String> photoTips,
 List<PartAlternativeDto> alternatives
) {}
