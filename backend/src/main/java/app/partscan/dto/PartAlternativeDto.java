package app.partscan.dto;

public record PartAlternativeDto(
 String name,
 Double confidence,
 String reason
) {}
