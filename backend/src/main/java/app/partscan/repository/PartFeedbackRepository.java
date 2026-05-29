package app.partscan.repository;

import app.partscan.entity.PartFeedback;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PartFeedbackRepository extends JpaRepository<PartFeedback, UUID> {
}
