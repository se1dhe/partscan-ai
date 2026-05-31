package app.partscan.repository;

import app.partscan.entity.PartMarketListing;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PartMarketListingRepository extends JpaRepository<PartMarketListing, UUID> {
 List<PartMarketListing> findByPartIdOrderByPriceAsc(UUID partId);
 void deleteByPartId(UUID partId);
}
