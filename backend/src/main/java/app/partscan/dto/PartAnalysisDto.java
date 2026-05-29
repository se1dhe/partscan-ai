package app.partscan.dto;
public record PartAnalysisDto(
 String name,
 String manufacturer,
 String articleNumber,
 String category,
 Double confidence
){}
