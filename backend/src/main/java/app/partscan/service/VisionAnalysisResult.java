package app.partscan.service;

import app.partscan.dto.PartAnalysisDto;

public record VisionAnalysisResult(PartAnalysisDto analysis, String rawResponse, String provider) {}
