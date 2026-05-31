package app.partscan.dto;

import app.partscan.entity.PartMarketListing;

import java.util.UUID;

public record PartMarketListingDto(
 UUID id,
 String source,
 String title,
 Integer price,
 String currency,
 String url,
 String location,
 String imageUrl,
 String matchedQuery
) {
 public static PartMarketListingDto from(PartMarketListing listing) {
  return new PartMarketListingDto(
   listing.getId(),
   listing.getSource(),
   listing.getTitle(),
   listing.getPrice(),
   listing.getCurrency(),
   listing.getUrl(),
   listing.getLocation(),
   listing.getImageUrl(),
   listing.getMatchedQuery()
  );
 }
}
