
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const TopPerforming: React.FC = () => {
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  // Chart data
  const series: number[] = [35000, 25000, 18000];

  // Chart options
  const options: ApexOptions = {
    labels: ["Electronics", "Clothing", "Home Goods"],
    colors: ["#AD63F6", "#37D80A", "#3584FC"],
    stroke: {
      width: 2,
    },
    plotOptions: {
      pie: {
        endAngle: 90,
        startAngle: -90,
        expandOnClick: false,
        donut: {
          size: "65%",
        },
      },
    },
    dataLabels: {
      enabled: false,
      style: {
        fontSize: "12px",
      },
      dropShadow: {
        enabled: false,
      },
      formatter: function (val: number) {
        return "$" + val.toFixed(1);
      },
      offsetX: 0,
      textAnchor: "middle",
    },
    tooltip: {
      y: {
        formatter: function (val: number) {
          return "$" + val;
        },
      },
    },
    legend: {
      show: false,
      position: "bottom",
      fontSize: "12px",
      horizontalAlign: "center",
      offsetX: 0,
      offsetY: -95,
      itemMargin: {
        horizontal: 8,
        vertical: 0,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "square",
      },
    },
  };

  return (
    <>
      {ChartComponent ? (
        <ChartComponent
          options={options}
          series={series}
          type="donut"
          height={160}
          width={"100%"}
        />
      ) : (
        <div>Loading chart...</div>
      )}
    </>
  );
};

export default TopPerforming;
