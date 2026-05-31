package app.partscan.dto;

import app.partscan.entity.Part;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PartDto(
 UUID id,
 String name,
 String normalizedName,
 String manufacturer,
 String articleNumber,
 String category,
 Double confidence,
 String imageUrl,
 String description,
 String condition,
 Boolean needsBetterPhoto,
 String partScope,
 String visibleComponentName,
 String assemblyName,
 String uncertaintyNote,
 String searchQueries,
 String identificationReason,
 String visibleMarkings,
 String compatibleVehicles,
 String sourceHints,
 String photoTips,
 String alternatives,
 String reviewStatus,
 Instant createdAt,
 Instant updatedAt,
 List<PartMarketListingDto> marketListings
) {
 public static PartDto from(Part part, List<PartMarketListingDto> marketListings) {
  return new PartDto(part.getId(), part.getName(), part.getNormalizedName(), part.getManufacturer(), part.getArticleNumber(), part.getCategory(), part.getConfidence(), part.getImageUrl(), part.getDescription(), part.getCondition(), part.getNeedsBetterPhoto(), part.getPartScope(), part.getVisibleComponentName(), part.getAssemblyName(), part.getUncertaintyNote(), part.getSearchQueries(), part.getIdentificationReason(), part.getVisibleMarkings(), part.getCompatibleVehicles(), part.getSourceHints(), part.getPhotoTips(), part.getAlternatives(), part.getReviewStatus(), part.getCreatedAt(), part.getUpdatedAt(), marketListings);
 }
}
